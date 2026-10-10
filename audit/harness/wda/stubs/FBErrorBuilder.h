#import <Foundation/Foundation.h>
@interface FBErrorBuilder : NSObject
@property (nonatomic, copy) NSString *desc;
+ (instancetype)builder;
- (instancetype)withDescription:(NSString *)d;
- (NSError *)build;
@end
