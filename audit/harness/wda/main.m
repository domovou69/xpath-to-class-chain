// mini-WDA: evaluates an XPath and a class chain against the same page source,
// using WDA v16.14.1 code for chain parsing, predicate attribute mapping and
// XPath extension functions. Usage: wdaemu cases.json > results.json
#import <Foundation/Foundation.h>
#import <libxml/parser.h>
#import <libxml/xmlwriter.h>
#import <libxml/xpath.h>
#import "Node.h"
#import "FBClassChainQueryParser.h"
#import "FBElementTypeTransformer.h"
#import "FBXPathExtensions.h"

static Node *buildTree(xmlNodePtr x, Node *parent, NSString *path, NSUInteger *ord) {
  Node *n = [Node new];
  n.parent = parent; n.indexPath = path; n.order = (*ord)++;
  n.elementType = [FBElementTypeTransformer elementTypeWithTypeName:[NSString stringWithUTF8String:(const char *)x->name]];
  for (xmlAttrPtr a = x->properties; a; a = a->next) {
    xmlChar *v = xmlNodeListGetString(x->doc, a->children, 1);
    [n setAttr:[NSString stringWithUTF8String:(const char *)a->name] value:[NSString stringWithUTF8String:v ? (const char *)v : ""]];
    xmlFree(v);
  }
  NSUInteger i = 0;
  for (xmlNodePtr c = x->children; c; c = c->next) {
    if (c->type != XML_ELEMENT_NODE) continue;
    [n.children addObject:buildTree(c, n, [path stringByAppendingFormat:@",%lu", (unsigned long)i++], ord)];
  }
  return n;
}

// XCTest returns query results breadth-first (observed on iOS 27 with WDA 16.14.1, Phase 2), and
// WDA hands XPath matches back through such a query (fb_filterDescendantsWithSnapshots), so both
// sides come back in this order. Positions inside an XPath are still document order (libxml2).
static void numberBFS(Node *root) {
  NSMutableArray<Node *> *q = [NSMutableArray arrayWithObject:root]; NSUInteger i = 0, k = 0;
  while (i < q.count) { Node *n = q[i++]; n.bfs = k++; [q addObjectsFromArray:n.children]; }
}
static NSArray<Node *> *inBFSOrder(NSArray<Node *> *a) {
  return [[[NSOrderedSet orderedSetWithArray:a] array] sortedArrayUsingComparator:^NSComparisonResult(Node *x, Node *y) {
    return x.bfs < y.bfs ? NSOrderedAscending : (x.bfs > y.bfs ? NSOrderedDescending : NSOrderedSame); }];
}

// ---- XPath side: mirrors FBXPath.m (attribute order, query-driven attribute inclusion, bool strings)
static NSArray *ATTRS;
static NSSet *attrsForQuery(NSString *q) {
  if ([q rangeOfString:@"[^\\w@]@\\*[^\\w]" options:NSRegularExpressionSearch].location != NSNotFound) return [NSSet setWithArray:ATTRS];
  NSMutableSet *r = [NSMutableSet set];
  for (NSString *a in ATTRS)
    if ([q rangeOfString:[NSString stringWithFormat:@"[^\\w@]@%@[^\\w]", a] options:NSRegularExpressionSearch].location != NSNotFound) [r addObject:a];
  return r;
}
static NSString *attrValue(Node *n, NSString *a, NSNumber *sib) {
  if ([a isEqualToString:@"type"]) return n.wdType;
  if ([a isEqualToString:@"value"]) return n.wdValue;
  if ([a isEqualToString:@"name"]) return n.wdName;
  if ([a isEqualToString:@"label"]) return n.wdLabel;
  if ([a isEqualToString:@"enabled"]) return n.wdEnabled ? @"true" : @"false";
  if ([a isEqualToString:@"visible"]) return n.wdVisible ? @"true" : @"false";
  if ([a isEqualToString:@"accessible"]) return n.wdAccessible ? @"true" : @"false";
  if ([a isEqualToString:@"hittable"]) return n.wdHittable ? @"true" : @"false";
  if ([@[@"x", @"y", @"width", @"height"] containsObject:a]) return [n.wdRect[a] description];
  if ([a isEqualToString:@"index"]) return sib ? sib.stringValue : [NSString stringWithFormat:@"%lu", (unsigned long)n.wdIndex];
  if ([a isEqualToString:@"placeholderValue"]) return n.wdPlaceholderValue;
  if ([a isEqualToString:@"traits"]) return n.wdTraits;
  return nil;
}
static void writeNode(xmlTextWriterPtr w, Node *n, NSSet *inc, NSNumber *sib) {
  xmlTextWriterStartElement(w, (xmlChar *)n.wdType.UTF8String);
  for (NSString *a in ATTRS) {
    if (![inc containsObject:a]) continue;
    NSString *v = attrValue(n, a, sib);
    if (v) xmlTextWriterWriteAttribute(w, (xmlChar *)a.UTF8String, (xmlChar *)v.UTF8String);
  }
  xmlTextWriterWriteAttribute(w, BAD_CAST "private_indexPath", (xmlChar *)n.indexPath.UTF8String);
  for (NSUInteger i = 0; i < n.children.count; i++) writeNode(w, n.children[i], inc, @(i));
  xmlTextWriterEndElement(w);
}
static void collect(Node *n, NSMutableDictionary *m) { m[n.indexPath] = n; for (Node *c in n.children) collect(c, m); }

static id runXPath(Node *root, NSString *q) {
  xmlDocPtr doc = NULL;
  xmlTextWriterPtr w = xmlNewTextWriterDoc(&doc, 0);
  xmlTextWriterStartDocument(w, NULL, "UTF-8", NULL);
  writeNode(w, root, attrsForQuery(q), nil);
  xmlTextWriterEndDocument(w); xmlFreeTextWriter(w);
  // WDA: [query stringByReplacingOccurrencesOfString:@"XCUIElementTypeAny" withString:@"*"]
  q = [q stringByReplacingOccurrencesOfString:@"XCUIElementTypeAny" withString:@"*"];
  xmlXPathContextPtr ctx = xmlXPathNewContext(doc);
  ctx->node = xmlDocGetRootElement(doc);   // context = the application element
  FBXPathExtensions *ext = [FBXPathExtensions new];
  [ext registerFunctionsWithContext:ctx];
  xmlXPathObjectPtr obj = xmlXPathEvalExpression((const xmlChar *)q.UTF8String, ctx);
  id result;
  if (!obj) {
    result = @{@"error": ext.lastEvaluationError ?: @"InvalidXPath"};
  } else {
    NSMutableDictionary *store = [NSMutableDictionary dictionary]; collect(root, store);
    NSMutableArray *nodes = [NSMutableArray array];
    xmlNodeSetPtr ns = obj->nodesetval;
    if (obj->type == XPATH_NODESET && ns) for (int i = 0; i < ns->nodeNr; i++) {
      xmlChar *p = xmlGetProp(ns->nodeTab[i], BAD_CAST "private_indexPath");
      if (!p) { result = @{@"error": @"non-element node in result"}; break; }
      Node *n = store[[NSString stringWithUTF8String:(const char *)p]]; xmlFree(p);
      if (n && n != root) [nodes addObject:n]; else if (n) [nodes addObject:n];
    }
    if (!result) result = inBFSOrder(nodes);
    xmlXPathFreeObject(obj);
  }
  xmlXPathFreeContext(ctx); xmlFreeDoc(doc);
  return result;
}

// ---- Class chain side: fb_snapshotDescendantsMatchingChainItems & helpers from
// XCUIElement+FBClassChain.m (v16.14.1), types adapted to Node.
static NSArray<Node *> *snapshotsMatchingItem(FBClassChainItem *item, NSArray<Node *> *roots) {
  NSMutableArray<Node *> *typeMatches = [NSMutableArray array];
  for (Node *root in roots) {
    if (item.isDescendant) {
      [typeMatches addObjectsFromArray:[root descendantsByFilteringWithBlock:^BOOL(Node *s) {
        return s != root && (item.type == XCUIElementTypeAny || s.elementType == item.type); }]];
    } else {
      for (Node *child in root.children)
        if (item.type == XCUIElementTypeAny || child.elementType == item.type) [typeMatches addObject:child];
    }
  }
  if (roots.count > 1) {
    NSMutableArray *dd = [NSMutableArray array]; NSHashTable *seen = [NSHashTable hashTableWithOptions:NSHashTableObjectPointerPersonality];
    for (Node *m in typeMatches) if (![seen containsObject:m]) { [seen addObject:m]; [dd addObject:m]; }
    typeMatches = dd;
  }
  for (FBAbstractPredicateItem *pi in item.predicates) {
    if ([pi isKindOfClass:FBSelfPredicateItem.class]) {
      typeMatches = [[typeMatches filteredArrayUsingPredicate:pi.value] mutableCopy];
    } else {
      NSMutableArray *cm = [NSMutableArray array];
      for (Node *cand in typeMatches) {
        NSArray *md = [cand descendantsByFilteringWithBlock:^BOOL(Node *d) { return d != cand && [pi.value evaluateWithObject:d]; }];
        if (md.count > 0) [cm addObject:cand];
      }
      typeMatches = cm;
    }
  }
  return typeMatches.copy;
}
static NSArray<Node *> *matchingWithItem(FBClassChainItem *item, NSArray<Node *> *cands, NSNumber *first) {
  if (1 == item.position.integerValue || (0 == item.position.integerValue && first.boolValue)) {
    Node *r = cands.firstObject; return r ? @[r] : @[];
  }
  if (0 == item.position.integerValue) return cands;
  if (cands.count >= (NSUInteger)ABS(item.position.integerValue))
    return item.position.integerValue > 0 ? @[cands[item.position.integerValue - 1]] : @[cands[cands.count + item.position.integerValue]];
  return @[];
}
// fb_queryDescendantsMatchingChainItems: the strategy WDA uses unless an intermediate step has a
// position (XCUIElement+FBClassChain.m:38-40). Each step is an XCUIElementQuery:
// descendantsMatchingType / childrenMatchingType, matchingPredicate for `…`, containingPredicate for
// $…$. Observed on device: results come back breadth-first, and containingPredicate also tests the
// element itself (XPath's .// does not).
static NSArray<Node *> *queryMatchingItem(FBClassChainItem *item, NSArray<Node *> *roots) {
  NSMutableArray<Node *> *m = [NSMutableArray array];
  for (Node *root in roots) {
    if (item.isDescendant) {
      [m addObjectsFromArray:[root descendantsByFilteringWithBlock:^BOOL(Node *s) {
        return s != root && (item.type == XCUIElementTypeAny || s.elementType == item.type); }]];
    } else {
      for (Node *child in root.children)
        if (item.type == XCUIElementTypeAny || child.elementType == item.type) [m addObject:child];
    }
  }
  NSArray<Node *> *cands = inBFSOrder(m);
  for (FBAbstractPredicateItem *pi in item.predicates) {
    if ([pi isKindOfClass:FBSelfPredicateItem.class]) {
      cands = [cands filteredArrayUsingPredicate:pi.value];
    } else {
      NSMutableArray *cm = [NSMutableArray array];
      for (Node *cand in cands)
        if ([cand descendantsByFilteringWithBlock:^BOOL(Node *d) { return [pi.value evaluateWithObject:d]; }].count > 0) [cm addObject:cand];
      cands = cm;
    }
  }
  return cands;
}
static id runChain(Node *root, NSString *chain) {
  @try {
    NSError *err;
    FBClassChain *parsed = [FBClassChainQueryParser parseQuery:chain error:&err];
    if (!parsed) return @{@"error": err.localizedDescription ?: @"parse error"};
    BOOL intermediatePosition = NO;
    for (NSUInteger i = 0; i + 1 < parsed.elements.count; i++) if (nil != parsed.elements[i].position) intermediatePosition = YES;
    if (!intermediatePosition) {
      NSArray *cands = @[root];
      for (FBClassChainItem *it in parsed.elements) cands = queryMatchingItem(it, cands);
      return inBFSOrder(matchingWithItem(parsed.elements.lastObject, cands, @NO));
    }
    // snapshot strategy (fb_snapshotDescendantsMatchingChainItems): breadth-first walk per root
    NSMutableArray *lookup = parsed.elements.mutableCopy;
    NSArray *currentRoots = @[root];
    FBClassChainItem *item = lookup.firstObject;
    NSArray *cands = snapshotsMatchingItem(item, currentRoots);
    [lookup removeObjectAtIndex:0];
    while (lookup.count > 0) {
      if (nil != item.position) {
        NSArray *m = matchingWithItem(item, cands, nil);
        if (0 == m.count) return @[];
        currentRoots = @[m.firstObject];
      } else currentRoots = cands;
      item = lookup.firstObject;
      cands = snapshotsMatchingItem(item, currentRoots);
      [lookup removeObjectAtIndex:0];
    }
    // fb_filterDescendantsWithSnapshots re-queries descendants -> query (breadth-first) order, de-duplicated
    return inBFSOrder(matchingWithItem(item, cands, @NO));
  } @catch (NSException *e) {
    return @{@"error": [NSString stringWithFormat:@"%@: %@", e.name, e.reason]};
  }
}
static id render(id r) {
  if ([r isKindOfClass:NSDictionary.class]) return r;
  NSMutableArray *o = [NSMutableArray array];
  for (Node *n in r) [o addObject:n.key ?: n.indexPath];
  return o;
}

int main(int argc, const char *argv[]) {
  @autoreleasepool {
    ATTRS = @[@"type", @"value", @"name", @"label", @"enabled", @"visible", @"accessible", @"x", @"y", @"width", @"height", @"index", @"hittable", @"placeholderValue", @"traits"];
    NSData *d = [NSData dataWithContentsOfFile:[NSString stringWithUTF8String:argv[1]]];
    NSArray *cases = [NSJSONSerialization JSONObjectWithData:d options:0 error:nil];
    NSMutableArray *out = [NSMutableArray array];
    for (NSDictionary *c in cases) {
      @autoreleasepool {
        NSString *xml = c[@"xml"];
        xmlDocPtr src = xmlReadMemory(xml.UTF8String, (int)strlen(xml.UTF8String), "x.xml", NULL, 0);
        if (!src) { [out addObject:@{@"id": c[@"id"], @"error": @"bad fixture xml"}]; continue; }
        NSUInteger ord = 0;
        Node *root = buildTree(xmlDocGetRootElement(src), nil, @"top", &ord);
        numberBFS(root);
        xmlFreeDoc(src);
        NSMutableDictionary *r = [NSMutableDictionary dictionaryWithObject:c[@"id"] forKey:@"id"];
        if ([c[@"xpath"] isKindOfClass:NSString.class]) r[@"xpath"] = render(runXPath(root, c[@"xpath"]));
        if ([c[@"chain"] isKindOfClass:NSString.class]) r[@"chain"] = render(runChain(root, c[@"chain"]));
        [out addObject:r];
      }
    }
    NSData *o = [NSJSONSerialization dataWithJSONObject:out options:NSJSONWritingPrettyPrinted error:nil];
    fwrite(o.bytes, 1, o.length, stdout);
  }
  return 0;
}
