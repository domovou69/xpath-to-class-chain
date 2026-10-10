#import "FBErrorBuilder.h"
#import "FBExceptions.h"
#import "FBLogger.h"
NSString *const FBInvalidArgumentException = @"FBInvalidArgumentException";
NSString *const FBClassChainQueryParseException = @"FBClassChainQueryParseException";
@implementation FBErrorBuilder
+ (instancetype)builder { return [self new]; }
- (instancetype)withDescription:(NSString *)d { self.desc = d; return self; }
- (NSError *)build { return [NSError errorWithDomain:@"WDA" code:1 userInfo:@{NSLocalizedDescriptionKey: self.desc ?: @""}]; }
@end
@implementation FBLogger
+ (void)log:(NSString *)m {}
+ (void)logFmt:(NSString *)f, ... {}
@end
