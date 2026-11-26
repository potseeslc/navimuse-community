# Build 42 feedback triage

Pulled 2026-09-14 UTC: 15 new screenshot reports, all associated with Build 42 on iOS 27. No Build 42 crash submissions returned. The crash submission is from Build 40 and the scene lifecycle fix is already in Build 42.

## Build 43 polish scope

Discover label; focused album cover and tracks with back navigation; softer artist image treatment; mobile mix banner without border or side gutters; removal of the Journey shortcut group below radio; round queue transport and removal of the unarmed pause-after shortcut. An armed pause remains cancellable; the full player menu still exposes pause-after. Album metadata prose, drag sorting, navigation redesign, downloads changes, playlist/genre imagery and ListenBrainz visual redesign remain follow-up work.

Validation: 10 focused UI tests passed; production web and embedded iOS screens built. Local browser fixture at 402px verified edge-to-edge banner with no horizontal overflow, album detail isolation and restored opener focus, and round queue controls. Physical playback has not been retested. Initial signed build failed because Xcode has no account and picked a wildcard development profile missing Associated Domains; distribution recovery is in progress.

## Reports

### AH40qEznP9oGBFaCenhOYOI

Follow-up scope.

These can live under a single settings tab

### AHsgqMV7H7DGsUMmr98E3TQ

Included or partially addressed in polish scope.

Can this section match whatever we do on the discovery page? Also, the homepage, instead of calling at home, can we call it discover

### AKB64W3HYx3cqVJKTE5HZY4

Follow-up scope.

Search could be a pull up card that lives in the library view and in the discovery view. It doesn’t need to have its own view in the bottom. We can actually get rid of that icon. It could live in those two tabs. We could actually move maybe the listen brain section into that space. Maybe do a some sort of cool like statistics icon or something

### AE19Wnm9pev4TRXRHtfTONs

Follow-up scope.

This option shouldn’t live in the download section. It should live in the queue. We just got rid of that pause button as part of our feedback. Maybe that could just be it. You have a little download with a circle button. Also, when we press that button, the download the circle with a download button, we should have a loading animation that shows the download on that button and its progress. We shouldn’t have it switching us to the downloads tab, and then the downloads tab if we have whole album should sort by albums, and if we have playlist should sort by by playlist

### ALJQjDT9tHNLJ-YAw15hdME

Follow-up scope.

There should be an option for just unlimited on storage there, or access to the full disc

### AELpj2EkbVREBkMIDMOieIk

Follow-up scope.

Same as their Navodrama supplied imagery for genre

### AGa2wnS_sKz5rgQ8JQT1LLk

Follow-up scope.

Nevadrome generates playlist images, and I think that we should be surfacing those here

### AHT0zS4mnAvu1LeW-47rsko

Included or partially addressed in polish scope.

In the album section here, we should, if you select it, it should just be the album cover, not the other covers around it with loading 100 more. We can always go back to the albums page, but it should be like if I’ve clicked into an album, I wanna focus on that album. Also check Navodrom and see if maybe there’s album information from the metadata source about like maybe like why they wrote the album and it could look just like the artist bio with the text with the faded bottom could be a really cool idea of like reviewers or something like that about that album

### AJsU3mNYVyIlQe5YY1LGBTc

Included or partially addressed in polish scope.

Can you apply some sort of filter to these images? They look great, but maybe some sort of like make them black-and-white or something like that, or maybe like a super saturated like Instagram filter, whatever looks best, but there should be like some sort of filter over the artist section just so that it doesn’t like look too clear since we’re already kind of have like everything else is kind of got a somewhat of a filter over it

### AGgZvHUv6nwbf9zprbhwRHA

Included or partially addressed in polish scope.

I’m still looking for like a banner that is full bleed, so like the the rounded corners, it should just be like edge to edge, like there’s no border at all. It just fills the entire space with the image of our previous songs

### ACTpsPe8kz4NKWhBKIJcLVw

Follow-up scope.

Can this match the last effect of the menu just below it?

### AKv31lj1cYWG-9LTLIiw4hA

Included or partially addressed in polish scope.

Let’s remove journeys from here and just keep them in the sonic tab and in the 3 dot on the player

### ABKL82skyaI6ymcPtB5xopU

Follow-up scope.

Don’t know really why we decided to put that there. I think it should be a discover section, an entire section, where we should look graphically like maybe images of some artists or from songs we’ve played or album art. I’m not necessarily sure, or maybe a cool chart. I’m not really sure. Let me think how this should look. I think it should be a graphical representation of our listening history in visual, so I would guess it could be like album art for the most played things. I know that that’s gonna also be repetitive with like our artists and our top, you know, personalized mix but in the end, I still wanted to be like visually, you know, forward with album art since we have so much of it and the implementation for it suggested track section where it’s like got the weekly mixes. I think we should import those mixes and only surface the things that are in our libraries. I understand that it doesn’t know what’s in the library, so we should just take out what’s not in our library and then just surface a queue based on that and you could just hit play and it would start playing that mix and that could be a graphical representation as well on the discovery page

### ALk84Wxd4_k7JtY0bLRimuc

Included or partially addressed in polish scope.

So the thing here is, is that can this player also mimic the rest of the app? It’s just, you know, square whenever the other button is round, the other part is at the top right corner. There’s a pause button. Hey, I don’t know what that pause button does. Does it pause the queue? Does it pause? It could probably just go away in general or explain to me better what it does do, cause I don’t know

### AL734rM2qESv2yofDcA1LsE

Follow-up scope.

Can we get handles that pick up and move the queue around, not just the upward and downward arrows? Will keep both, but I think the handles can be a little better with a touch interface on mobile and don’t forget about using the motion skill for the animations for the handle grabs and the sorting
