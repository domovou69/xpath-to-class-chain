#import <Foundation/Foundation.h>
extern NSString *const FBUnknownAttributeException;
@interface FBElementUtils : NSObject
+ (NSString *)wdAttributeNameForAttributeName:(NSString *)name;
+ (NSDictionary<NSString *, NSString *> *)wdAttributeNamesMapping;
@end
