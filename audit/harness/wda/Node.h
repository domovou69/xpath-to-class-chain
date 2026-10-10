// In-memory stand-in for an XCTest element snapshot. Implements the FBElement
// protocol directly so WDA's predicate block evaluates against it unchanged.
#import <Foundation/Foundation.h>
#import <XCTest/XCTest.h>
#import "FBElement.h"
@interface Node : NSObject <FBElement>
@property (nonatomic) XCUIElementType elementType;
@property (nonatomic, strong) NSMutableArray<Node *> *children;
@property (nonatomic, weak) Node *parent;
@property (nonatomic, copy) NSString *key;      // test-only label, never visible to WDA code
@property (nonatomic, copy) NSString *indexPath;
@property (nonatomic) NSUInteger order;         // pre-order position
- (void)setAttr:(NSString *)name value:(NSString *)value;
- (NSArray<Node *> *)descendantsByFilteringWithBlock:(BOOL (^)(Node *))block;
@end
