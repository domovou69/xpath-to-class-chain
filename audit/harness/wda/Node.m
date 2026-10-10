#import "Node.h"
#import "FBElementTypeTransformer.h"
@implementation Node
@synthesize wdFrame = _wdFrame, wdNativeFrame = _wdNativeFrame, wdName = _wdName, wdLabel = _wdLabel,
  wdSelected = _wdSelected, wdType = _wdType, wdTraits = _wdTraits, wdValue = _wdValue, wdUID = _wdUID,
  wdEnabled = _wdEnabled, wdVisible = _wdVisible, wdAccessible = _wdAccessible,
  wdNativeAccessibilityElement = _wdNativeAccessibilityElement, wdAccessibilityContainer = _wdAccessibilityContainer,
  wdFocused = _wdFocused, wdHittable = _wdHittable, wdPlaceholderValue = _wdPlaceholderValue,
  wdMinValue = _wdMinValue, wdMaxValue = _wdMaxValue, wdCustomActions = _wdCustomActions;
- (instancetype)init { if ((self = [super init])) { _children = [NSMutableArray array]; _wdEnabled = YES; _wdVisible = YES; _wdAccessible = NO; } return self; }
static BOOL B(NSString *v) { return [v isEqualToString:@"true"]; }
- (void)setAttr:(NSString *)n value:(NSString *)v {
  if ([n isEqualToString:@"name"]) _wdName = v;
  else if ([n isEqualToString:@"label"]) _wdLabel = v;
  else if ([n isEqualToString:@"value"]) _wdValue = v;
  else if ([n isEqualToString:@"enabled"]) _wdEnabled = B(v);
  else if ([n isEqualToString:@"visible"]) _wdVisible = B(v);
  else if ([n isEqualToString:@"accessible"]) _wdAccessible = B(v);
  else if ([n isEqualToString:@"selected"]) _wdSelected = B(v);
  else if ([n isEqualToString:@"hittable"]) _wdHittable = B(v);
  else if ([n isEqualToString:@"focused"]) _wdFocused = B(v);
  else if ([n isEqualToString:@"placeholderValue"]) _wdPlaceholderValue = v;
  else if ([n isEqualToString:@"traits"]) _wdTraits = v;
  else if ([n isEqualToString:@"k"]) _key = v;
  else if ([n isEqualToString:@"x"]) _wdFrame.origin.x = v.doubleValue;
  else if ([n isEqualToString:@"y"]) _wdFrame.origin.y = v.doubleValue;
  else if ([n isEqualToString:@"width"]) _wdFrame.size.width = v.doubleValue;
  else if ([n isEqualToString:@"height"]) _wdFrame.size.height = v.doubleValue;
}
// Same as XCUIElement+FBWebDriverAttributes.m: position among ALL parent children
- (NSUInteger)wdIndex { if (self.parent) return [self.parent.children indexOfObjectIdenticalTo:self]; return 0; }
- (NSDictionary *)wdRect { CGRect f = _wdFrame; return @{@"x": @(CGRectGetMinX(f)), @"y": @(CGRectGetMinY(f)), @"width": @(CGRectGetWidth(f)), @"height": @(CGRectGetHeight(f))}; }
- (NSString *)wdType { return [FBElementTypeTransformer stringWithElementType:self.elementType]; }
- (id)fb_valueForWDAttributeName:(NSString *)name { return nil; }
// XCTest's descendantsByFilteringWithBlock: pre-order walk that includes the receiver (per WDA comment)
- (NSArray<Node *> *)descendantsByFilteringWithBlock:(BOOL (^)(Node *))block {
  NSMutableArray *r = [NSMutableArray array];
  NSMutableArray *stack = [NSMutableArray arrayWithObject:self];
  while (stack.count) { Node *n = stack.lastObject; [stack removeLastObject];
    if (block(n)) [r addObject:n];
    for (Node *c in n.children.reverseObjectEnumerator) [stack addObject:c]; }
  return r;
}
@end
