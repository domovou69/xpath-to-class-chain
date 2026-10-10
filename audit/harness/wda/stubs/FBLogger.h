#import <Foundation/Foundation.h>
@interface FBLogger : NSObject
+ (void)log:(NSString *)m;
+ (void)logFmt:(NSString *)f, ...;
@end
