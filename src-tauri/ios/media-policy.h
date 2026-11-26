#import <Foundation/Foundation.h>

// Shared with the executable native boundary test. Artwork stays behind the
// authenticated BFF; station-provided remote URLs never receive session cookies.
static inline BOOL NMTrustedURL(NSURL *url) {
    return [url.scheme isEqual:@"https"] && [url.host isEqual:@"navimuse.example.com"] &&
        (!url.port || url.port.integerValue == 443) && !url.user.length && !url.password.length;
}

static inline BOOL NMArtworkURL(NSURL *url) {
    if (!NMTrustedURL(url)) return NO;
    NSString *path = url.path;
    if (!path) return NO;
    for (NSString *part in path.pathComponents) {
        if ([part isEqual:@"."] || [part isEqual:@".."]) return NO;
    }
    return [path rangeOfString:@"^/api/navidrome/(cover/[^/]+|radios/[^/]+/artwork)$"
                      options:NSRegularExpressionSearch].location != NSNotFound;
}

// Only account-scoped first-party manifests may receive the native session cookies.
static inline BOOL NMHLSURL(NSURL *url, NSString *scope) {
    if(!scope.length || !NMTrustedURL(url) || url.fragment.length ||
       [url.path rangeOfString:@"^/api/navidrome/hls/sessions/[a-f0-9]{48}/master\\.m3u8$" options:NSRegularExpressionSearch].location==NSNotFound)return NO;
    NSArray<NSURLQueryItem *> *query=[NSURLComponents componentsWithURL:url resolvingAgainstBaseURL:NO].queryItems;
    return query.count==1 && [query[0].name isEqual:@"accountScope"] && [query[0].value isEqual:scope];
}
