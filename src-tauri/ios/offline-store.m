#import "offline-store.h"
#import "navidrome-id.h"
#import <TargetConditionals.h>
#import <math.h>

static const unsigned long long NMOfflineTrackLimit = 1024ULL*1024*1024;
static const unsigned long long NMOfflineDefaultBudget = 2ULL*1024*1024*1024;
static BOOL NMStoreFailure(NSError **error, NSString *message) {
    if(error)*error=[NSError errorWithDomain:@"NaviMuseOffline" code:2 userInfo:@{NSLocalizedDescriptionKey:message}];return NO;
}
static BOOL NMStoreText(id value, NSUInteger max) {return [value isKindOfClass:NSString.class] && [value length]>0 && [value length]<=max;}
static BOOL NMStoreMIME(id value) {return [@[@"audio/wav",@"audio/aiff",@"audio/mpeg",@"audio/mp4",@"audio/aac",@"audio/flac",@"audio/ogg"] containsObject:value?:@""];}
static BOOL NMStoreUUID(id value) {return [value isKindOfClass:NSString.class] && [[NSUUID alloc] initWithUUIDString:value]!=nil;}
static NSDictionary *NMStoreSong(id input) {
    if(![input isKindOfClass:NSDictionary.class]||!NMStoreText(input[@"id"],512)||input[@"streamUrl"]||[input[@"isRadio"] isEqual:@YES])return nil;
    NSMutableDictionary *song=[NSMutableDictionary dictionaryWithObject:input[@"id"] forKey:@"id"];
    for(NSString *key in @[@"title",@"artist",@"album",@"albumId",@"artistId",@"coverArt",@"suffix",@"contentType"])
        if(NMStoreText(input[key],2048))song[key]=input[key];
    for(NSString *key in @[@"duration",@"track",@"discNumber",@"bitRate",@"samplingRate",@"bitDepth",@"channelCount"])
        if([input[key] isKindOfClass:NSNumber.class] && isfinite([input[key] doubleValue]) && [input[key] doubleValue]>=0)song[key]=input[key];
    if([input[@"downloadCollections"] isKindOfClass:NSArray.class]) {
        NSMutableArray *collections=[NSMutableArray new];NSMutableSet *seen=[NSMutableSet new];
        for(id collection in input[@"downloadCollections"]) {
            if(collections.count>=32)break;
            if(![collection isKindOfClass:NSDictionary.class]||!NMStoreText(collection[@"id"],512)||!NMStoreText(collection[@"name"],512)||[seen containsObject:collection[@"id"]])continue;
            [seen addObject:collection[@"id"]];[collections addObject:@{@"id":collection[@"id"],@"name":collection[@"name"],@"position":@([collection[@"position"] isKindOfClass:NSNumber.class]?MAX(0,MIN(10000,[collection[@"position"] integerValue])):0)}];
        }
        song[@"downloadCollections"]=collections;
    }
    return song;
}
@interface NMOfflineStore ()
@property(nonatomic) NSURL *root;
@property(nonatomic) NMOfflineAccess *access;
@property(nonatomic, nullable) NSString *scope;
@property(nonatomic) NSMutableDictionary *records;
@property(nonatomic) NSDictionary *outputOwnership;
@property(nonatomic, nullable) NSDictionary *canonicalRecordIDs;
@property(nonatomic, readwrite) unsigned long long budgetBytes;
@property(nonatomic, readwrite) BOOL allowsCellular;
@end
@implementation NMOfflineStore
- (instancetype)initWithRootURL:(NSURL *)root access:(NMOfflineAccess *)access {
    if((self=[super init])) {
        _root=root;_access=access;_records=[NSMutableDictionary new];_outputOwnership=@{@"state":@"unknown"};_budgetBytes=NMOfflineDefaultBudget;
        NSData *data=[NSData dataWithContentsOfURL:[root URLByAppendingPathComponent:@"preferences.json"]];
        id prefs=data?[NSJSONSerialization JSONObjectWithData:data options:0 error:NULL]:nil;
        if([prefs isKindOfClass:NSDictionary.class]) {
            _allowsCellular=[prefs[@"allowsCellular"] isEqual:@YES];
            unsigned long long budget=[prefs[@"budgetBytes"] isKindOfClass:NSNumber.class]?[prefs[@"budgetBytes"] unsignedLongLongValue]:0;
            if([prefs[@"budgetBytes"] isKindOfClass:NSNumber.class] && [self validBudget:budget])_budgetBytes=budget;
        }
    }return self;
}
- (BOOL)validBudget:(unsigned long long)budget { return budget==0 || budget==512ULL*1024*1024 || budget==NMOfflineDefaultBudget || budget==5ULL*1024*1024*1024 || budget==10ULL*1024*1024*1024; }
- (NSURL *)directory {return [self.root URLByAppendingPathComponent:[self.scope stringByReplacingOccurrencesOfString:@":" withString:@"_"] isDirectory:YES];}
- (BOOL)prepare:(NSURL *)directory error:(NSError **)error {
    NSDictionary *attrs=@{};
#if TARGET_OS_IPHONE
    attrs=@{NSFileProtectionKey:NSFileProtectionCompleteUntilFirstUserAuthentication};
#endif
    if(![NSFileManager.defaultManager createDirectoryAtURL:directory withIntermediateDirectories:YES attributes:attrs error:error])return NO;
    return [directory setResourceValue:@YES forKey:NSURLIsExcludedFromBackupKey error:error];
}
- (BOOL)protect:(NSURL *)file error:(NSError **)error {
#if TARGET_OS_IPHONE
    if(![NSFileManager.defaultManager setAttributes:@{NSFileProtectionKey:NSFileProtectionCompleteUntilFirstUserAuthentication} ofItemAtPath:file.path error:error])return NO;
#endif
    return [file setResourceValue:@YES forKey:NSURLIsExcludedFromBackupKey error:error];
}
- (BOOL)write:(NSDictionary *)object to:(NSURL *)url error:(NSError **)error {
    if(![self prepare:url.URLByDeletingLastPathComponent error:error])return NO;
    NSData *data=[NSJSONSerialization dataWithJSONObject:object options:0 error:error];
    return data && [data writeToURL:url options:NSDataWritingAtomic error:error] && [self protect:url error:error];
}
- (BOOL)save:(NSError **)error {
    if(!self.scope)return NMStoreFailure(error,@"Reconnect to authorize downloaded music.");
    return [self write:@{@"version":@1,@"scope":self.scope,@"records":self.records,@"outputOwnership":self.outputOwnership?:@{@"state":@"unknown"}} to:[[self directory] URLByAppendingPathComponent:@"index.json"] error:error];
}
- (NSDictionary *)context {
    NSDictionary *context=[self.access contextAtMS:NSDate.date.timeIntervalSince1970*1000 uptime:NSProcessInfo.processInfo.systemUptime];
    NSString *scope=context[@"scope"];
    if(!scope){self.scope=nil;self.canonicalRecordIDs=nil;[self.records removeAllObjects];return nil;}
    if(![self.scope isEqual:scope]) {
        self.scope=scope;self.canonicalRecordIDs=nil;self.records=[NSMutableDictionary new];self.outputOwnership=@{@"state":@"unknown"};
        NSData *data=[NSData dataWithContentsOfURL:[[self directory] URLByAppendingPathComponent:@"index.json"]];
        id saved=data?[NSJSONSerialization JSONObjectWithData:data options:NSJSONReadingMutableContainers error:NULL]:nil;
        if([saved isKindOfClass:NSDictionary.class] && [saved[@"scope"] isEqual:scope] && [saved[@"version"] isEqual:@1] && [saved[@"records"] isKindOfClass:NSDictionary.class]) {
            id ownership=saved[@"outputOwnership"];
            if([ownership isKindOfClass:NSDictionary.class] && [@[@"local",@"remote",@"unknown"] containsObject:ownership[@"state"]?:@""]){
                self.outputOwnership=@{@"state":ownership[@"state"],@"label":NMStoreText(ownership[@"label"],128)?ownership[@"label"]:@""};
            }
            [saved[@"records"] enumerateKeysAndObjectsUsingBlock:^(id key,id value,BOOL *stop){
                if(!NMStoreText(key,512)||![value isKindOfClass:NSDictionary.class]||![value[@"song"] isKindOfClass:NSDictionary.class]||![value[@"song"][@"id"] isEqual:key]||!NMStoreUUID(value[@"ticket"]))return;
                NSDictionary *song=NMStoreSong(value[@"song"]);if(!song)return;
                NSMutableDictionary *record=[@{@"song":song,@"ticket":value[@"ticket"],@"state":@"failed",@"message":@"Download interrupted. Retry when connected."} mutableCopy];
                if([value[@"state"] isEqual:@"complete"] && NMStoreUUID(value[@"file"]) && NMStoreMIME(value[@"mimeType"]) && [value[@"bytes"] isKindOfClass:NSNumber.class] && [value[@"bytes"] unsignedLongLongValue]>0 && [value[@"bytes"] unsignedLongLongValue]<=NMOfflineTrackLimit) {
                    NSURL *file=[[self directory] URLByAppendingPathComponent:[value[@"file"] stringByAppendingString:@".nmmedia"]];
                    NSDictionary *attrs=[NSFileManager.defaultManager attributesOfItemAtPath:file.path error:NULL];
                    if([attrs[NSFileType] isEqual:NSFileTypeRegular] && [attrs[NSFileSize] isEqual:value[@"bytes"]]) {
                        record[@"state"]=@"complete";record[@"file"]=value[@"file"];record[@"mimeType"]=value[@"mimeType"];record[@"bytes"]=value[@"bytes"];[record removeObjectForKey:@"message"];
                    }
                } else if([value[@"state"] isEqual:@"cancelled"]) {record[@"state"]=@"cancelled";record[@"message"]=@"Download cancelled.";}
                self.records[key]=record;
            }];
        }
        // Recover interrupted installs/removals: only manifest-referenced media
        // remain. Never delete unrelated files or follow a saved caller path.
        NSMutableSet *live=[NSMutableSet new];for(NSDictionary *r in self.records.allValues)if(r[@"file"])[live addObject:[r[@"file"] stringByAppendingString:@".nmmedia"]];
        for(NSURL *file in [NSFileManager.defaultManager contentsOfDirectoryAtURL:[self directory] includingPropertiesForKeys:nil options:0 error:NULL])
            if([file.pathExtension isEqual:@"nmmedia"] && NMStoreUUID(file.lastPathComponent.stringByDeletingPathExtension) && ![live containsObject:file.lastPathComponent])[NSFileManager.defaultManager removeItemAtURL:file error:NULL];
    }
    return context;
}
- (NSString *)storedSongID:(NSString *)songID {
    return [self recordKeyForSongID:songID context:[self context]];
}
- (NSString *)recordKeyForSongID:(NSString *)songID context:(NSDictionary *)context {
    if(!context)return nil;
    if(self.records[songID])return songID;
    if(![context[@"navidromeIdFormat"] isEqual:@"canonical-v1"])return nil;
    if(!self.canonicalRecordIDs) {
        NSMutableDictionary *aliases=[NSMutableDictionary new];
        for(NSString *key in self.records) {
            NSString *canonical=NMCanonicalNavidromeID(key);
            aliases[canonical]=aliases[canonical]?NSNull.null:key;
        }
        self.canonicalRecordIDs=aliases;
    }
    id key=self.canonicalRecordIDs[NMCanonicalNavidromeID(songID)];
    return [key isKindOfClass:NSString.class]?key:nil;
}
- (unsigned long long)usedBytes {
    unsigned long long bytes=0;
    NSDirectoryEnumerator *files=[NSFileManager.defaultManager enumeratorAtURL:self.root includingPropertiesForKeys:@[NSURLIsRegularFileKey,NSURLFileSizeKey] options:NSDirectoryEnumerationSkipsHiddenFiles errorHandler:nil];
    for(NSURL *file in files)if([file.pathExtension isEqual:@"nmmedia"]){
        NSDictionary *attrs=[NSFileManager.defaultManager attributesOfItemAtPath:file.path error:NULL];
        if([attrs[NSFileType] isEqual:NSFileTypeRegular])bytes+=[attrs[NSFileSize] unsignedLongLongValue];
    }return bytes;
}
- (NSDictionary *)snapshot {
    NSDictionary *context=[self context];NSMutableArray *songs=[NSMutableArray new];
    if(context)for(NSString *key in [self.records.allKeys sortedArrayUsingSelector:@selector(compare:)]){
        NSDictionary *r=self.records[key];NSMutableDictionary *song=[r[@"song"] mutableCopy];
        if([context[@"navidromeIdFormat"] isEqual:@"canonical-v1"])song[@"id"]=NMCanonicalNavidromeID(key);
        NSMutableDictionary *item=[@{@"song":song,@"state":r[@"state"],@"bytes":r[@"bytes"]?:@0} mutableCopy];
        if(r[@"message"])item[@"message"]=r[@"message"];[songs addObject:item];
    }
    NSMutableDictionary *result=[@{@"available":context?@YES:@NO,@"tracks":songs,@"allowsCellular":@(self.allowsCellular),@"budgetBytes":@(self.budgetBytes),@"usedBytes":@([self usedBytes])} mutableCopy];
    if(context){result[@"scope"]=context[@"scope"];result[@"expiresAt"]=context[@"expiresAt"];result[@"outputOwnership"]=self.outputOwnership;}return result;
}
- (BOOL)setOutputOwnership:(NSDictionary *)ownership scope:(NSString *)scope error:(NSError **)error {
    NSDictionary *context=[self context];
    if(!context)return YES; // No authorized offline playback exists to protect.
    if(![context[@"scope"] isEqual:scope] || ![ownership isKindOfClass:NSDictionary.class] || ![@[@"local",@"remote",@"unknown"] containsObject:ownership[@"state"]?:@""])return NMStoreFailure(error,@"Playback ownership could not be saved for this account.");
    NSDictionary *next=@{@"state":ownership[@"state"],@"label":NMStoreText(ownership[@"label"],128)?ownership[@"label"]:@""};
    if([next isEqual:self.outputOwnership])return YES;
    NSDictionary *previous=self.outputOwnership;self.outputOwnership=next;
    if(![self save:error]){self.outputOwnership=previous;return NO;}return YES;
}
- (BOOL)setAllowsCellular:(BOOL)cellular budgetBytes:(unsigned long long)budget error:(NSError **)error {
    if(![self validBudget:budget])return NMStoreFailure(error,@"Choose a supported download storage limit.");
    if(![self write:@{@"allowsCellular":@(cellular),@"budgetBytes":@(budget)} to:[self.root URLByAppendingPathComponent:@"preferences.json"] error:error])return NO;
    self.allowsCellular=cellular;self.budgetBytes=budget;return YES;
}
- (NSString *)beginSong:(NSDictionary *)input error:(NSError **)error {
    return [self beginSongs:@[input?:@{}] error:error].firstObject[@"ticket"];
}
- (NSArray<NSDictionary *> *)beginSongs:(NSArray *)inputs error:(NSError **)error {
    NSDictionary *context=[self context];if(!context){NMStoreFailure(error,@"Reconnect to authorize downloaded music.");return nil;}
    if(![inputs isKindOfClass:NSArray.class] || inputs.count==0 || inputs.count>500){NMStoreFailure(error,@"Choose up to 500 songs at a time.");return nil;}
    if(self.budgetBytes && [self usedBytes]>=self.budgetBytes){NMStoreFailure(error,@"Download storage limit reached. Remove music or increase the limit.");return nil;}
    NSMutableDictionary *before=[self.records mutableCopy];NSMutableArray *added=[NSMutableArray new];NSMutableSet *seen=[NSMutableSet new];BOOL metadataChanged=NO;
    for(id input in inputs){
        NSDictionary *song=NMStoreSong(input);if(!song)continue;
        NSString *songID=song[@"id"];
        NSString *stored=[self recordKeyForSongID:songID context:context];NSDictionary *old=stored?self.records[stored]:nil;
        if(old) {
            NSMutableDictionary *merged=[song mutableCopy];
            merged[@"downloadCollections"]=[(song[@"downloadCollections"]?:@[]) arrayByAddingObjectsFromArray:old[@"song"][@"downloadCollections"]?:@[]];
            song=NMStoreSong(merged);
            if([old[@"state"] isEqual:@"complete"]) {
                NSMutableDictionary *updated=[old mutableCopy],*savedSong=[old[@"song"] mutableCopy];
                savedSong[@"downloadCollections"]=song[@"downloadCollections"]?:@[];updated[@"song"]=savedSong;self.records[stored]=updated;metadataChanged=YES;continue;
            }
        }
        if(!old && self.records.count>=10000)continue;
        // Retain the stored key for in-flight tickets and retry callbacks.
        if(stored){songID=stored;NSMutableDictionary *saved=[song mutableCopy];saved[@"id"]=stored;song=saved;}
        if([seen containsObject:songID])continue;[seen addObject:songID];
        NSString *ticket=NSUUID.UUID.UUIDString;
        self.records[songID]=[@{@"song":song,@"ticket":ticket,@"state":@"queued"} mutableCopy];
        self.canonicalRecordIDs=nil;
        [added addObject:@{@"songID":songID,@"ticket":ticket}];
    }
    if(!added.count && !metadataChanged){NMStoreFailure(error,@"No new library songs to download. Remove old items if the list is full.");return nil;}
    if(![self save:error]){self.records=before;self.canonicalRecordIDs=nil;return nil;}return added;
}
- (BOOL)setState:(NSString *)state songID:(NSString *)songID ticket:(NSString *)ticket message:(NSString *)message error:(NSError **)error {
    if(![self context] || ![self.records[songID][@"ticket"] isEqual:ticket])return NMStoreFailure(error,@"Download changed or account access expired.");
    if(![@[@"queued",@"downloading",@"failed",@"cancelled"] containsObject:state] || [self.records[songID][@"state"] isEqual:@"complete"])return NMStoreFailure(error,@"Invalid download transition.");
    NSMutableDictionary *old=[self.records[songID] mutableCopy];
    self.records[songID][@"state"]=state;
    if(NMStoreText(message,512))self.records[songID][@"message"]=message;else[self.records[songID] removeObjectForKey:@"message"];
    if(![self save:error]){self.records[songID]=old;return NO;}return YES;
}
- (BOOL)installFile:(NSURL *)temporary mimeType:(NSString *)mimeType songID:(NSString *)songID ticket:(NSString *)ticket error:(NSError **)error {
    if(![self context] || ![self.records[songID][@"ticket"] isEqual:ticket] || ![self.records[songID][@"state"] isEqual:@"downloading"])return NMStoreFailure(error,@"Download cancelled or account access changed.");
    if(!NMStoreMIME(mimeType))return NMStoreFailure(error,@"Unsupported downloaded audio format.");
    NSDictionary *attrs=[NSFileManager.defaultManager attributesOfItemAtPath:temporary.path error:error];
    unsigned long long bytes=[attrs[NSFileSize] unsignedLongLongValue],used=[self usedBytes];
    if(![attrs[NSFileType] isEqual:NSFileTypeRegular] || bytes==0 || bytes>NMOfflineTrackLimit)return NMStoreFailure(error,@"Downloaded file is empty or too large.");
    if(self.budgetBytes && (used>self.budgetBytes || bytes>self.budgetBytes-used))return NMStoreFailure(error,@"Download storage limit reached. Remove music or increase the limit.");
    if(![self prepare:[self directory] error:error])return NO;
    NSString *name=NSUUID.UUID.UUIDString;NSURL *destination=[[self directory] URLByAppendingPathComponent:[name stringByAppendingString:@".nmmedia"]];
    if(![NSFileManager.defaultManager moveItemAtURL:temporary toURL:destination error:error])return NO;
    if(![self protect:destination error:error]){[NSFileManager.defaultManager removeItemAtURL:destination error:NULL];return NO;}
    NSMutableDictionary *old=[self.records[songID] mutableCopy];
    self.records[songID][@"state"]=@"complete";self.records[songID][@"file"]=name;self.records[songID][@"mimeType"]=mimeType;self.records[songID][@"bytes"]=@(bytes);[self.records[songID] removeObjectForKey:@"message"];
    if(![self save:error]){self.records[songID]=old;[NSFileManager.defaultManager removeItemAtURL:destination error:NULL];return NO;}return YES;
}
- (NSURL *)mediaForSongID:(NSString *)songID scope:(NSString *)scope {
    NSDictionary *context=[self context];if(![context[@"scope"] isEqual:scope])return nil;
    NSString *stored=[self recordKeyForSongID:songID context:context];NSDictionary *record=stored?self.records[stored]:nil;if(![record[@"state"] isEqual:@"complete"] || !NMStoreUUID(record[@"file"]))return nil;
    NSURL *file=[[self directory] URLByAppendingPathComponent:[record[@"file"] stringByAppendingString:@".nmmedia"]];
    NSDictionary *attrs=[NSFileManager.defaultManager attributesOfItemAtPath:file.path error:NULL];
    return [attrs[NSFileType] isEqual:NSFileTypeRegular] && [attrs[NSFileSize] isEqual:record[@"bytes"]]?file:nil;
}
- (NSString *)mimeTypeForSongID:(NSString *)songID scope:(NSString *)scope {
    if(![self mediaForSongID:songID scope:scope])return nil;
    NSString *stored=[self storedSongID:songID];return stored?self.records[stored][@"mimeType"]:nil;
}
- (BOOL)removeSongID:(NSString *)songID error:(NSError **)error {
    if(![self context])return NMStoreFailure(error,@"Reconnect to manage this account's downloaded music.");
    songID=[self storedSongID:songID];if(!songID)return YES;
    NSDictionary *old=self.records[songID];if(!old)return YES;
    [self.records removeObjectForKey:songID];self.canonicalRecordIDs=nil;if(![self save:error]){self.records[songID]=[old mutableCopy];return NO;}
    if(old[@"file"]){NSURL *url=[[self directory] URLByAppendingPathComponent:[old[@"file"] stringByAppendingString:@".nmmedia"]];if(![NSFileManager.defaultManager removeItemAtURL:url error:error] && [NSFileManager.defaultManager fileExistsAtPath:url.path])return NO;}return YES;
}
- (BOOL)clearAllDownloadedMusic:(NSError **)error {
    NSArray *directories=[NSFileManager.defaultManager contentsOfDirectoryAtURL:self.root includingPropertiesForKeys:nil options:0 error:error];
    if(!directories && [NSFileManager.defaultManager fileExistsAtPath:self.root.path])return NO;
    self.scope=nil;self.canonicalRecordIDs=nil;[self.records removeAllObjects];
    for(NSURL *directory in directories) {
        if([directory.lastPathComponent rangeOfString:@"^queue-scope-v[12]_[a-f0-9]{64}$" options:NSRegularExpressionSearch].location==NSNotFound)continue;
        NSDictionary *attrs=[NSFileManager.defaultManager attributesOfItemAtPath:directory.path error:NULL];
        if([attrs[NSFileType] isEqual:NSFileTypeDirectory] && ![NSFileManager.defaultManager removeItemAtURL:directory error:error])return NO;
    }return YES;
}
- (BOOL)clearCurrentScope:(NSError **)error {
    if(![self context])return NMStoreFailure(error,@"Reconnect to manage this account's downloaded music.");
    for(NSString *key in self.records.allKeys)if(![self removeSongID:key error:error])return NO;return YES;
}
@end
