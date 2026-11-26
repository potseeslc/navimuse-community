#import <Foundation/Foundation.h>
#import <CommonCrypto/CommonDigest.h>

// Same deterministic conversion as Navidrome 0.64. No file renames or metadata
// guessing: only the authenticated offline grant may enable these aliases.
static NSString *NMCanonicalNavidromeID(NSString *input) {
    if(![input isKindOfClass:NSString.class])return input;
    NSString *hex=input;
    if(input.length==36) {
        if([input rangeOfString:@"^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$" options:NSRegularExpressionSearch].location==NSNotFound)return input;
        hex=[input stringByReplacingOccurrencesOfString:@"-" withString:@""];
    }
    const char *alphabet="0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    __uint128_t number=0,max=~(__uint128_t)0;
    if(hex.length==32) {
        if([hex rangeOfString:@"^[0-9a-fA-F]{32}$" options:NSRegularExpressionSearch].location==NSNotFound)return input;
        const char *bytes=hex.lowercaseString.UTF8String;
        for(NSUInteger i=0;i<32;i++)number=number*16+(bytes[i]<='9'?bytes[i]-'0':bytes[i]-'a'+10);
    } else if(input.length==22) {
        if([input rangeOfString:@"^[0-9a-zA-Z]{22}$" options:NSRegularExpressionSearch].location==NSNotFound)return input;
        const char *bytes=input.UTF8String;BOOL overflow=NO;
        for(NSUInteger i=0;i<22;i++) {
            unsigned digit=(unsigned)(strchr(alphabet,bytes[i])-alphabet);
            if(number>(max-digit)/62){overflow=YES;break;}number=number*62+digit;
        }
        if(!overflow)return input;
        unsigned char digest[CC_MD5_DIGEST_LENGTH];
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
        CC_MD5(bytes,22,digest);
#pragma clang diagnostic pop
        number=0;for(NSUInteger i=0;i<16;i++)number=number*256+digest[i];
    } else return input;
    char output[23];output[22]=0;
    for(int i=21;i>=0;i--){output[i]=alphabet[number%62];number/=62;}
    return [NSString stringWithUTF8String:output];
}
