# BeBold 2.0: Can we avoid "Read and change all your data on all websites"?

Research ticket resolved against primary sources only: developer.chrome.com, the Chromium
source tree, Chrome Web Store policy pages, and the actual published CRX packages of the
four named competitors.

**Date of investigation:** 2026-08-23
**Chromium source revision:** `main` branch as served by the official Chromium GitHub mirror
on the date above.

---

## 0. Short answer

Yes, the warning is avoidable, but only by giving up automatic activation at install time.

The warning string is produced by *effective host permissions*, which Chromium defines as the
union of `host_permissions` **and** `content_scripts.matches`. BeBold today has no
`permissions` block at all, yet still triggers the maximum warning purely because of
`content_scripts[0].matches = ["<all_urls>"]`. Deleting the content script and using
`optional_host_permissions` plus `chrome.scripting.registerContentScripts()` produces a clean,
warning-free install, and after a single one-time grant the extension auto-runs on every page
forever. That is the recommendation. Full reasoning in section 8.

Of the four competitors, **exactly one (ADHD Reading Help) avoids the warning**, and it pays
for it with a toolbar click on every single page load. The three that auto-run all eat the
full `<all_urls>` warning.

---

## 1. How Chrome turns a manifest into a warning string

### 1.1 The chain, traced through Chromium

There is no single documentation page that lists the manifest-to-string mapping. The Chrome
docs explicitly punt: the *Permission warning guidelines* page says only that "Specific
warnings are noted in the Permissions under the permission to which they apply"
([permission-warnings](https://developer.chrome.com/docs/extensions/develop/concepts/permission-warnings)),
and the [permissions list](https://developer.chrome.com/docs/extensions/reference/permissions-list)
covers API permissions but not host patterns. So the authoritative mapping has to come from
the source. The chain is:

**Step 1.** Host warnings are computed from `effective_hosts()`, which is the union of
explicitly declared host permissions and content script match patterns:

```cpp
void PermissionSet::InitEffectiveHosts() {
  effective_hosts_ =
      URLPatternSet::CreateUnion(explicit_hosts(), scriptable_hosts());
}
```

Source: [`extensions/common/permissions/permission_set.cc`](https://source.chromium.org/chromium/chromium/src/+/main:extensions/common/permissions/permission_set.cc)

`scriptable_hosts()` is where `content_scripts.matches` lands. **This is the single most
important fact in this document for BeBold's current situation:** a content script match
pattern is treated identically to a declared host permission for warning purposes. Having no
`permissions` block buys nothing.

**Step 2.** The provider decides between "all hosts" and an enumerated host list:

```cpp
void ChromePermissionMessageProvider::AddHostPermissions(...) const {
  ...
  if (permissions.ShouldWarnAllHosts()) {
    permission_ids->insert(APIPermissionID::kHostsAll);
  } else {
    URLPatternSet regular_hosts;
    ExtensionsClient::Get()->FilterHostPermissions(
        permissions.effective_hosts(), &regular_hosts, permission_ids);
    std::set<std::string> hosts =
        permission_message_util::GetDistinctHosts(regular_hosts, true, true);
    for (const auto& host : hosts) {
      permission_ids->insert(APIPermissionID::kHostReadWrite,
                             base::UTF8ToUTF16(host));
    }
  }
}
```

Source: [`chrome/common/extensions/permissions/chrome_permission_message_provider.cc`](https://source.chromium.org/chromium/chromium/src/+/main:chrome/common/extensions/permissions/chrome_permission_message_provider.cc)

**Step 3.** `ShouldWarnAllHosts()` is true if *any* effective host pattern matches an
effective TLD:

```cpp
void PermissionSet::InitShouldWarnAllHostsForHostPermissions() const {
  ...
  if (effective_hosts().MatchesAllURLs()) {
    host_permissions_should_warn_all_hosts_ = ShouldWarnAllHostsType::kWarnAllHosts;
    return;
  }
  for (const auto& pattern : effective_hosts_) {
    if (pattern.MatchesEffectiveTld()) {
      host_permissions_should_warn_all_hosts_ = ShouldWarnAllHostsType::kWarnAllHosts;
      break;
    }
  }
}
```

Source: [`extensions/common/permissions/permission_set.cc`](https://source.chromium.org/chromium/chromium/src/+/main:extensions/common/permissions/permission_set.cc)

**Step 4.** `MatchesEffectiveTld()` returns true for any pattern with an empty host and
subdomain matching, **regardless of the path component**:

```cpp
bool URLPattern::MatchesEffectiveTld(...) const {
  // Check if it matches all urls or is a pattern like http://*/*.
  if (match_all_urls_ || (match_subdomains_ && host_.empty())) {
    return true;
  }
  ...
}
```

Source: [`extensions/common/url_pattern.cc`](https://source.chromium.org/chromium/chromium/src/+/main:extensions/common/url_pattern.cc)

This closes off a tempting loophole. `https://*/` (path `/`, no trailing wildcard) is **not**
narrower than `https://*/*` for warning purposes. The path is never examined. The Chrome docs
agree that the two forms are equivalent: the match patterns page lists "`https://*/*` or
`https://*/`" together as patterns that match "any URL using the `https` scheme"
([match-patterns](https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns)).
Bionify's manifest tries exactly this pattern and does not escape the warning (section 7).

### 1.2 The exact strings

Resolved from `chrome/app/generated_resources.grd`, which is where the `IDS_` constants used
by `chrome_permission_message_rules.cc` are defined.

| Resource ID | Exact string |
|---|---|
| `IDS_EXTENSION_PROMPT_WARNING_ALL_HOSTS` | `Read and change all your data on all websites` |
| `IDS_EXTENSION_PROMPT_WARNING_ALL_HOSTS_READ_ONLY` | `Read all your data on all websites` |
| `IDS_EXTENSION_PROMPT_WARNING_1_HOST` | `Read and change your data on $1` |
| `IDS_EXTENSION_PROMPT_WARNING_2_HOSTS` | `Read and change your data on $1 and $2` |
| `IDS_EXTENSION_PROMPT_WARNING_3_HOSTS` | `Read and change your data on $1, $2, and $3` |
| `IDS_EXTENSION_PROMPT_WARNING_HOSTS_LIST` | `Read and change your data on a number of websites` |
| `IDS_EXTENSION_PROMPT_WARNING_HOST_AND_SUBDOMAIN` | `all $1 sites` |
| `IDS_EXTENSION_PROMPT_WARNING_TABS` (the `tabs` permission) | `Read your browsing history` |

Sources: [`chrome/app/generated_resources.grd`](https://source.chromium.org/chromium/chromium/src/+/main:chrome/app/generated_resources.grd)
(lines approx. 5382 to 5492) and
[`chrome/common/extensions/permissions/chrome_permission_message_rules.cc`](https://source.chromium.org/chromium/chromium/src/+/main:chrome/common/extensions/permissions/chrome_permission_message_rules.cc).
The `tabs` string is also documented on the
[permissions list](https://developer.chrome.com/docs/extensions/reference/permissions-list):
"`tabs` ... Warning displayed: Read your browsing history."

The one/two/three/many selection is done by `HostListFormatter`, constructed in
`chrome_permission_message_rules.cc` with exactly those four message IDs in that order.

### 1.3 Suppression rules

`chrome_permission_message_rules.cc` defines, for each message, a list of permission IDs it
*absorbs*. The all-hosts rule absorbs a large set, including `kTab` (the `tabs` permission),
`kTopSites`, `kWebNavigation`, `kProcesses`, `kFavicon`, `kHostReadWrite`, `kHostReadOnly`,
`kDeclarativeNetRequest`, `kDeclarativeWebRequest`, and `kWebAuthenticationProxy`:

```cpp
{IDS_EXTENSION_PROMPT_WARNING_ALL_HOSTS,
 {APIPermissionID::kHostsAll},
 {APIPermissionID::kDeclarativeWebRequest,
  APIPermissionID::kDeclarativeNetRequestFeedback,
  APIPermissionID::kFavicon, APIPermissionID::kHostsAllReadOnly,
  APIPermissionID::kHostReadOnly, APIPermissionID::kHostReadWrite,
  APIPermissionID::kProcesses, APIPermissionID::kTab,
  APIPermissionID::kTopSites, APIPermissionID::kWebNavigation,
  APIPermissionID::kDeclarativeNetRequest,
  APIPermissionID::kWebAuthenticationProxy}},
```

The docs state the same rule in prose: "Some permissions may not display warnings when paired
with other permissions. For example, the `\"tabs\"` warning won't show if the extension also
requests `\"<all_urls>\"`"
([permission-warnings](https://developer.chrome.com/docs/extensions/develop/concepts/permission-warnings)).

Practical consequence: once you are already showing the all-hosts warning, adding `tabs`,
`webNavigation`, or `topSites` costs you nothing in the install dialog. Conversely, if you
successfully drop to zero warnings, adding `tabs` re-introduces "Read your browsing history"
on its own. Do not add `tabs` to BeBold 2.0.

---

## 2. Warning produced by each option

This is the answer to requirement 1. Every row was derived from the source chain in section 1
and cross-checked against the permissions list documentation.

| # | Manifest declaration | Warning string shown at install |
|---|---|---|
| 1 | `content_scripts: [{ matches: ["<all_urls>"] }]` **(BeBold today)** | **Read and change all your data on all websites** |
| 2 | `host_permissions: ["<all_urls>"]` | **Read and change all your data on all websites** (identical, same code path) |
| 3 | `host_permissions: ["https://*/*", "http://*/*"]` | **Read and change all your data on all websites** (`MatchesEffectiveTld` is true) |
| 4 | `host_permissions: ["https://*/"]` (path `/`, the "narrow" trick) | **Read and change all your data on all websites** (path is never examined) |
| 5 | `permissions: ["activeTab"]` alone | **No warning at all** |
| 6 | `optional_host_permissions: ["<all_urls>"]` with no static content script | **No warning at all** at install; warning deferred to the runtime prompt |
| 7 | `permissions: ["scripting"]` + `chrome.scripting.registerContentScripts()` at runtime | **No warning** from `scripting` itself; the warning depends entirely on what hosts you declare elsewhere |
| 8 | Adding `permissions: ["storage"]` to any of the above | **No change. `storage` produces no warning.** |
| 9 | Adding `permissions: ["tabs"]` | Adds "Read your browsing history", unless suppressed by an all-hosts warning |
| 10 | `host_permissions: ["https://example.com/*"]` (one concrete host) | Read and change your data on example.com |

Notes on the zero-warning rows, all confirmed on the
[permissions list](https://developer.chrome.com/docs/extensions/reference/permissions-list):

- `"activeTab"`: "Gives temporary access to the active tab through a user gesture." No
  "Warning displayed:" clause. The activeTab concept page states it directly: activeTab
  "serves as an alternative for many uses of `\"<all_urls>\"`, but displays no warning message
  during installation"
  ([activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)).
  The warning guidelines page repeats it: "This permission does not display a permission
  warning."
- `"storage"`: "Gives access to the `chrome.storage` API." No warning clause. **`storage`
  is free.** This matters because BeBold 2.0 needs `chrome.storage.sync` for per-site
  preferences and that requirement costs nothing in the install dialog.
- `"scripting"`: "Gives access to the `chrome.scripting` API." No warning clause.

**Critical correction to a common assumption about row 7.** `scripting` +
`registerContentScripts()` is *not* an escape hatch on its own. Registration succeeds without
host permissions (there is no permission check in
[`ScriptingRegisterContentScriptsFunction::Run`](https://source.chromium.org/chromium/chromium/src/+/main:extensions/browser/api/scripting/scripting_api.cc)),
but *injection* is gated separately at runtime by
`UserScriptInjector::CanExecuteOnFrame()`, which returns
`PermissionsData::PageAccess::kAllowed` / `kWithheld` / `kDenied`
([`extensions/renderer/user_script_injector.cc`](https://source.chromium.org/chromium/chromium/src/+/main:extensions/renderer/user_script_injector.cc),
consumed in [`extensions/renderer/script_injection.cc`](https://source.chromium.org/chromium/chromium/src/+/main:extensions/renderer/script_injection.cc)).
So a dynamically registered script silently does nothing on origins you lack access to. The
scripting docs say the same thing from the other direction: "declare the `\"scripting\"`
permission in the manifest **plus the host permissions** for the pages to inject scripts into"
([scripting API](https://developer.chrome.com/docs/extensions/reference/api/scripting)).

`registerContentScripts` is therefore a *delivery mechanism*, not a permission dodge. Its value
is that it lets you obtain the hosts later (via an optional grant) instead of at install time.
Registered scripts persist by default: `persist_across_sessions.value_or(true)` in
`ScriptingRegisterContentScriptsFunction::Run`.

---

## 3. UX cost of each option

This is requirement 2. The axis that matters for a reading aid is **how often the user must
perform a gesture**.

| Option | Gesture frequency | Auto-runs on page load? |
|---|---|---|
| `content_scripts` + `<all_urls>` (today) | **Never** | Yes, on every page, immediately |
| `host_permissions: ["<all_urls>"]` | **Never** | Yes (via `registerContentScripts` or `executeScript`) |
| `activeTab` alone | **Every page load, and again after any cross-origin navigation** | No |
| `optional_host_permissions` + `permissions.request()` | **Once ever** (if the user grants all sites) or **once per origin** | Yes, after the grant |
| `scripting` + `registerContentScripts` | Inherits whatever host grant you have | Depends on the grant |

### 3.1 activeTab, precisely

Both the grant and the expiry are documented verbatim on the
[activeTab concept page](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab):

> The `"activeTab"` permission gives an extension temporary access to the currently active tab
> when the user invokes the extension, for example by clicking its action. Access to the tab
> lasts while the user is on that page, and is revoked when the user navigates away or closes
> the tab. For example, if the user invokes the extension on `https://example.com` and then
> navigates to `https://example.com/foo`, the extension will continue to have access to the
> page. If the user navigates to `https://chromium.org`, access is revoked.

What it grants, while active:

> Call `scripting.insertCSS()` or `scripting.executeScript()` on that tab if the `"scripting"`
> permission is also declared ... Get the URL, title, and favicon for that tab via an API that
> returns a `tabs.Tab` object ... Intercept network requests in the tab to the tab's main frame
> origin using the `webRequest` API.

What invokes it (the complete list, quoted):

> Executing an action, Executing a context menu item, Executing a keyboard shortcut from the
> commands API, Accepting a suggestion from the omnibox API.

So the precise expiry rule is: **same-origin navigation preserves the grant, cross-origin
navigation revokes it, closing the tab revokes it.** There is no persistence across tabs and
none across browser restarts.

For BeBold this is the decisive fact. Same-origin navigation preserving access sounds
generous, but a reading aid is used across many different sites in a session. A user reading
Wikipedia, then Hacker News, then a Substack post has to click the toolbar three times. And
a keyboard shortcut counts as a gesture, which softens the cost but does not remove it: it is
still one deliberate action per origin, on a product whose entire value proposition is that
text is *already* readable when the page appears.

`activeTab` also cannot be triggered programmatically. There is no way to auto-invoke it on
`tabs.onUpdated`, because the whole point is that it requires a genuine user gesture.

### 3.2 The optional grant, precisely

`chrome.permissions.request()` "must be requested from inside a user gesture, like a button's
click handler" ([permissions API](https://developer.chrome.com/docs/extensions/reference/api/permissions)).
That gesture is required **once**, not per page. If you request `origins: ["<all_urls>"]` and
the user accepts, the grant is permanent and BeBold auto-runs everywhere from then on, exactly
like today, but with a clean install.

The same page notes: "Chrome prompts the user if adding the permissions results in different
warning messages than the user has already seen and accepted." So a second request for an
already-granted scope is a silent no-op, not a repeated nag.

---

## 4. Does `optional_host_permissions` still show a scary install warning?

This is requirement 3. **No.**

The [declare permissions](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions)
page draws the line explicitly, listing the manifest keys and their warning behaviour:

> `"permissions"` Contains items from a list of known strings. **Changes may trigger a
> warning.**
> `"optional_permissions"` **Granted by the user at runtime, instead of at install time.**
> `"content_scripts.matches"` Contains one or more match patterns that allows content scripts
> to inject into one or more hosts. **Changes may trigger a warning.**
> `"host_permissions"` Contains one or more match patterns that give access to one or more
> hosts. **Changes may trigger a warning.**
> `"optional_host_permissions"` **Granted by the user at runtime, instead of at install time.**

Note that `content_scripts.matches` is in the warning-triggering group and
`optional_host_permissions` is not. That is the whole game.

The same page recommends this route: "Consider using optional permissions wherever the
functionality of your extension permits, to provide users with informed control over access to
resources and data."

The mechanical reason optional host permissions produce no install warning is that
`PermissionsParser` keeps required and optional permission sets separate, and the install
prompt is built only from the required set. `PermissionsManager::HasRequestedActiveTab`, for
instance, has to check *both* sets explicitly because they are distinct objects
([`extensions/browser/permissions_manager.cc`](https://source.chromium.org/chromium/chromium/src/+/main:extensions/browser/permissions_manager.cc)).

### 4.1 The runtime grant flow and Chrome's site access UI

Chrome's current per-extension site access control offers three states. The live strings are:

| Resource ID | String |
|---|---|
| `IDS_EXTENSIONS_CONTEXT_MENU_PAGE_ACCESS_RUN_ON_CLICK_V2` | `Ask on every visit` |
| `IDS_EXTENSIONS_CONTEXT_MENU_PAGE_ACCESS_RUN_ON_SITE_V2` | `Always on $1` (origin) |
| `IDS_EXTENSIONS_CONTEXT_MENU_PAGE_ACCESS_RUN_ON_ALL_SITES_V2` | `Always on all sites` |

An older, still-present variant reads `When you click the extension` / `On $1` / `On all
sites`. Both sets are in
[`chrome/app/generated_resources.grd`](https://source.chromium.org/chromium/chromium/src/+/main:chrome/app/generated_resources.grd)
(lines approx. 5941 to 5962). The menu also exposes `Manage site permissions` and `Learn more
about site access`.

**Does this UI make the manifest choice moot?** Partly, and this cuts against over-thinking
the problem, but it does not eliminate the install-warning difference. Two findings:

**Finding A: the default is permissive, not restrictive.** Withholding is a stored preference
that defaults to off:

```cpp
bool PermissionsManager::HasWithheldHostPermissions(
    const Extension& extension) const {
  return extension_prefs_->GetWithholdingPermissions(extension.id());
}
```

and in `AddPermissionsForWithholding`-style logic:

```cpp
bool should_withhold = false;
if (extension.creation_flags() & Extension::WITHHOLD_PERMISSIONS) {
  should_withhold = true;
} else {
  should_withhold = HasWithheldHostPermissions(extension);
}
if (!should_withhold) {
  return desired_permissions.Clone();
}
```

Source: [`extensions/browser/permissions_manager.cc`](https://source.chromium.org/chromium/chromium/src/+/main:extensions/browser/permissions_manager.cc)

So an ordinary Web Store install of an extension declaring `<all_urls>` is granted all sites
immediately and lands on "Always on all sites". The user *can* downgrade to "Ask on every
visit", but nothing pushes them to. The install warning is shown precisely because the access
is real and active from the first page load.

**Finding B: the controls appear for `activeTab`-only extensions too, but they are inert.**
`GetSiteAccess` early-returns an empty access object unless the extension has requested host
permissions **or** activeTab:

```cpp
if (!HasRequestedHostPermissions(extension) &&
    !HasRequestedActiveTab(extension)) {
  return extension_access;
}
```

and `GetUserSiteAccess` falls through to `kOnClick` when there is no host access:

```cpp
ExtensionSiteAccess site_access = GetSiteAccess(extension, gurl);
if (site_access.has_all_sites_access) return UserSiteAccess::kOnAllSites;
if (site_access.has_site_access)      return UserSiteAccess::kOnSite;
return UserSiteAccess::kOnClick;
```

Source: [`extensions/browser/permissions_manager.cc`](https://source.chromium.org/chromium/chromium/src/+/main:extensions/browser/permissions_manager.cc)

So an activeTab-only extension shows in the site access UI permanently pinned at "Ask on every
visit". The user cannot promote it to "Always on all sites", because there are no host
permissions in the manifest to grant. **This is why `activeTab` alone is a dead end for
BeBold: there is no user-facing escape hatch from the per-page click.**

The calculus, then: Chrome's site-access UI gives users *ongoing* control regardless of the
manifest, but it does not give them a way to opt *into* access an extension never declared.
`optional_host_permissions` is the only construct that is simultaneously invisible at install
and promotable to always-on later.

---

## 5. Competitor manifests

This is requirement 4, and it produced the most useful finding in the ticket.

### 5.1 Method

I did not rely on chrome-stats or on the store listing's rendered permissions section. I
downloaded the actual signed CRX for each extension from Google's own extension update
service, the same endpoint Chrome itself uses:

```
https://clients2.google.com/service/update2/crx?response=redirect&prodversion=120&acceptformat=crx2,crx3&x=id%3D<EXTENSION_ID>%26uc
```

then stripped the CRX3 header and read `manifest.json` out of the embedded ZIP. These are the
published manifests as shipped, not a third party's summary of them. Each package also
contained `_metadata/verified_contents.json`, confirming they are Google-signed store builds.

### 5.2 Results

**Half Bold** (`ndgbjebkdbfehipdojkdldkddgggbdoj`), v2.0.4, 4.84 stars from 51, approx. 9K users:

```json
"permissions": ["storage", "sidePanel", "activeTab", "tabs"],
"content_scripts": [
  { "matches": ["<all_urls>"], "js": ["speedflow.51d5e7d9.js"], "all_frames": true, "css": [] }
],
"web_accessible_resources": [
  { "resources": ["assets/icons/icon*.png", "assets/fonts/*.ttf", "assets/fonts/kindle/**/*.otf"],
    "matches": ["<all_urls>"] }
],
"commands": { "toggle-reader": { "suggested_key": { "default": "Alt+B" } } }
```

No `host_permissions` key at all, which is cosmetic: the `<all_urls>` content script match
puts it in `scriptable_hosts` and produces the full warning anyway. Built with Plasmo.
**Warning: "Read and change all your data on all websites".** Its `tabs` permission is
absorbed and shows nothing extra.

**Bionify** (`gomhfpbcjfidhpffhecghfdieincgncc`), v0.0.3, 4.69 from 26, approx. 10K users:

```json
"permissions": ["storage", "activeTab", "scripting", "tabs"],
"host_permissions": ["http://*/", "https://*/"],
"commands": {
  "toggle-bionify":      { "suggested_key": { "default": "Ctrl+Shift+Y" } },
  "toggle-auto-bionify": { "suggested_key": { "default": "Ctrl+Shift+H" } }
}
```

No static content scripts; it injects via `scripting`. The `http://*/` form (path `/` rather
than `/*`) looks like an attempt to narrow the pattern, but per section 1.1 the path is never
examined by `MatchesEffectiveTld()`, so this does not help.
**Warning: "Read and change all your data on all websites".**

**ADHD Reading Help** (`hhhkpidlaeengejelinhblaibbfgkhih`), v1.1, 3.97 from 32, approx. 7K users:

```json
"manifest_version": 3,
"name": "ADHD Reading Help",
"version": "1.1",
"permissions": ["activeTab", "scripting"],
"action": { "default_icon": { "16": "...", "48": "...", "128": "..." } },
"background": { "service_worker": "background.js" }
```

**No host permissions. No content scripts. No `<all_urls>`. This extension installs with zero
permission warnings.** It is the only one of the four that does.

Its entire background service worker is five lines, and it confirms the exact UX price:

```js
chrome.action.onClicked.addListener((tab) => {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });
  });
```

One toolbar click per tab, re-required after every cross-origin navigation, with no keyboard
shortcut declared (no `commands` key) and no persistence. It also ships a `popup.html` and
`popup.js` that are unreachable from the action, since `action` declares only `default_icon`
and an action with no popup fires `onClicked`. So the click is unavoidable and un-shortcuttable.

**Hyper Bold** (`bjicoipahmlimcmjoejgaoneibennoab`), v0.0.0.1, 3.59 from 34, approx. 7K users:

```json
"permissions": ["activeTab", "storage", "tabs"],
"content_scripts": [
  { "matches": ["<all_urls>"], "js": ["content.js"], "run_at": "document_idle" }
]
```

**Warning: "Read and change all your data on all websites".** Its `content.js` auto-runs and
gates itself on a stored per-site allowlist:

```js
const DEFAULT_SETTINGS = {
  enabled: true,
  enableHighlighting: false,
  highlightColor: "yellow",
  websites: [],
  blacklist: [],
};
```

This is architecturally the closest thing to BeBold 2.0's stated design: broad injection plus
per-site preferences in storage. Note it uses `chrome.storage.local`, not `sync`.

**BeBold** (`ckgjflmajkijpaipoijlpleihipnpjma`), v1.4, for reference: the published CRX matches
the manifest in the ticket exactly, plus the store-injected `update_url`.
**Warning: "Read and change all your data on all websites".**

### 5.3 Summary table

| Extension | Rating | Users | Host declaration | Install warning | Auto-runs? |
|---|---|---|---|---|---|
| Half Bold | 4.84 (51) | ~9K | `content_scripts` `<all_urls>` | Read and change all your data on all websites | Yes |
| Bionify | 4.69 (26) | ~10K | `host_permissions` `http://*/`, `https://*/` | Read and change all your data on all websites | Yes |
| ADHD Reading Help | 3.97 (32) | ~7K | **none** | **none** | **No, click per page** |
| Hyper Bold | 3.59 (34) | ~7K | `content_scripts` `<all_urls>` | Read and change all your data on all websites | Yes |
| **BeBold (today)** | 3.80 (?) | 878 | `content_scripts` `<all_urls>` | Read and change all your data on all websites | Yes |

### 5.4 What this actually tells us

The honest reading is more interesting than "copy the one that avoided the warning".

Three of four competitors, including **both of the top-rated ones**, accept the full
`<all_urls>` warning. The one extension that avoided it entirely sits at 3.97, below both
`<all_urls>` extensions that auto-run, and it has fewer users than either. Meanwhile Hyper
Bold takes the warning *and* rates 3.59, so the warning plainly is not the dominant variable
in either direction.

The defensible conclusion: **the install warning is not what is capping ratings in this
category, and eliminating it by shipping click-per-page is a net negative trade.** Half Bold
at 4.84 takes the maximum warning and wins on execution (side panel, `Alt+B` shortcut,
`all_frames: true`, font control, i18n). That is where BeBold's 3.80 and its declining
installs are actually leaking.

But that argues against `activeTab`-only, not against removing the warning *for free*. None of
the four competitors tried `optional_host_permissions`. That is an unoccupied position:
Half Bold's automatic behaviour with ADHD Reading Help's clean install.

---

## 6. Chrome Web Store review and policy consequences

This is requirement 5.

**Review latency: yes, documented, and confirmed twice.** The match patterns reference states
plainly that `<all_urls>` "affects all hosts" and therefore "Chrome web store reviews for
extensions that use it **may take longer**"
([match-patterns](https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns)).

The [review process page](https://developer.chrome.com/docs/webstore/review-process) gives the
baseline and the aggravating factors: "For most extensions, review is completed within a few
days, but it can take up to a few weeks", with closer examination triggered by "new
developers", "new extensions", "dangerous permission requests", and "significant code
changes". It calls out host permission patterns "`*://*/*`, `https://*/*`, and `<all_urls>`"
as giving "extensive access to the user's web activity", and notes that code volume and
minification also slow review.

Relevant to BeBold specifically: it is an *existing* extension with an *existing* developer
account, so two of the four aggravating signals do not apply. But a 2.0 rewrite is by
definition a "significant code change", and it currently carries a "dangerous permission
request". Shipping 2.0 with `<all_urls>` intact stacks two of the four signals at once.

**Policy: narrowest-permission requirement.** The
[Use of Permissions policy](https://developer.chrome.com/docs/webstore/program-policies/permissions)
is binding and unambiguous:

> Request access to the narrowest permissions necessary to implement your Product's features
> or services. If more than one permission could be used to implement a feature, you must
> request those with the least access to data or functionality. Don't attempt to "future
> proof" your Product by requesting a permission that might benefit services or features that
> have not yet been implemented.

Note "you **must** request those with the least access". Since `optional_host_permissions`
demonstrably implements BeBold's feature set with strictly less install-time access than
`host_permissions`, a reviewer applying this policy literally has grounds to prefer it. This
is a point in favour of the recommendation beyond user perception.

**Dashboard justification: required per permission.** The
[privacy practices tab documentation](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
states the Permissions justification section "contains a list of permissions that your
extension uses (as declared in your manifest), with a field for you to state the justification
for each permission", and instructs developers to "Fill out these fields to tell the reviewers
why your extension needs to use each permission". It also warns: "If there are permissions
listed here that you don't require, remove them from your manifest and upload a new version of
your extension before continuing." The same tab requires a single purpose description, a
remote code declaration, and a data usage certification.

**Accessibility category specifically: no special rule found.** I checked the program policies
and the review process documentation and found **no** category-specific review track,
exemption, or additional requirement for extensions listed under Accessibility. The
narrowest-permissions policy and the `<all_urls>` review-latency note apply uniformly. Being an
accessibility tool earns BeBold no latitude on `<all_urls>` in policy terms, though it is
obviously useful material for the justification field.

---

## 7. Recommended manifest for BeBold 2.0

```jsonc
{
  "manifest_version": 3,
  "name": "BeBold",
  "version": "2.0",
  "description": "...",
  "icons": { "16": "...", "48": "...", "128": "..." },

  // Zero install warnings: storage and scripting are both warning-free,
  // and optional_host_permissions is granted at runtime, not install time.
  "permissions": ["storage", "scripting"],
  "optional_host_permissions": ["http://*/*", "https://*/*"],

  "action": { "default_popup": "popup.html" },
  "background": { "service_worker": "sw.js" },

  // Deliberately NO "content_scripts" key. A static matches array would
  // land in scriptable_hosts and re-trigger the all-hosts warning.
  // Deliberately NO "tabs" permission: it costs "Read your browsing history"
  // once the all-hosts warning is gone to absorb it.

  "commands": {
    "toggle-bebold": { "suggested_key": { "default": "Alt+B" }, "description": "Toggle BeBold" }
  }
}
```

Runtime flow:

1. On first run, open an onboarding page or popup with a single primary button.
2. In that button's click handler (the required user gesture), call
   `chrome.permissions.request({ origins: ["http://*/*", "https://*/*"] })`.
3. On grant, call `chrome.scripting.registerContentScripts([...])` with
   `matches: ["http://*/*", "https://*/*"]`, `runAt: "document_start"`, and
   `persistAcrossSessions: true` (the default). From that point BeBold auto-runs on every page
   on every future browser launch, with no further gestures, exactly like v1.4.
4. Re-register on `chrome.runtime.onInstalled` if the grant is present, and listen to
   `chrome.permissions.onRemoved` to unregister.
5. Offer a per-site grant path (`origins: ["https://example.com/*"]`) for users who decline
   the broad grant. Those users get "Read and change your data on example.com" in the runtime
   prompt instead, and BeBold still works automatically on the sites they chose.

Keep per-site enable/disable preferences in `chrome.storage.sync` as planned. That is free.

---

## 8. Recommendation, with the tradeoff stated plainly

**Ship `optional_host_permissions` with a one-time onboarding grant. Do not ship `activeTab`
alone, and do not keep the static `<all_urls>` content script.**

**What you gain.** The install dialog shows no permission warnings whatsoever, which is the
same install experience as ADHD Reading Help. chrome-stats should stop flagging the extension
as critical risk, since there is no required `<all_urls>` in the manifest. You also move from
the wrong side to the right side of the Chrome Web Store's "narrowest permissions necessary"
policy, and you drop one of the four documented review-latency signals just as the 2.0 rewrite
is adding another one ("significant code changes").

**What you pay.** Exactly one extra screen, once, ever. A new user installs BeBold, sees no
warning, opens the extension, and clicks one button that says something like "Turn on BeBold
everywhere". Chrome then shows the runtime prompt containing the same "Read and change all your
data on all websites" language. After that click, BeBold behaves identically to v1.4 forever:
automatic on every page, no gesture, across restarts.

So the warning text is not actually eliminated, it is **relocated from an unexplained
pre-install dialog to a moment where you control the surrounding context.** That relocation is
the entire value, and it is substantial: at install time the warning arrives with no
explanation and competes with the user's decision to install at all, whereas at onboarding you
can precede it with one sentence explaining that BeBold needs to read page text in order to
bold it, and that it sends nothing anywhere.

**The real risk, stated honestly.** You are inserting a step into the funnel. Some percentage
of installs will never click the button and will conclude BeBold is broken. That is a genuine
new failure mode that v1.4 does not have, and it must be mitigated in the UI: open the
onboarding page automatically on `chrome.runtime.onInstalled`, and if the grant is missing,
have the action badge show a state that makes the un-granted condition obvious rather than
looking like a dead extension.

**Why not `activeTab` alone**, despite it being the simplest zero-warning answer: it is
structurally incapable of auto-running, the site access UI offers no way for a user to promote
it to always-on (section 4.1, Finding B), and the one competitor that took this route rates
3.97 with the fewest users of the four. For a reading aid, a click on every page load is a
materially worse product, and the evidence in this category does not suggest the clean install
compensates.

**Why not simply keep `<all_urls>`**, despite the top two competitors doing exactly that: the
warning is free to remove under the recommended design. Half Bold's 4.84 says the warning is
survivable, not that it is costless, and "survivable" is a weak reason to keep something when
the alternative costs one onboarding click. The evidence does say the warning is not BeBold's
main problem, so this change should be treated as hygiene shipped alongside the real fix
(execution quality: keyboard shortcut, `all_frames`, per-site controls, the Custom Highlight
API rewrite), not as the fix itself.

---

## 9. What I could not establish

1. **The exact runtime permission prompt wording.** The
   [permissions API page](https://developer.chrome.com/docs/extensions/reference/api/permissions)
   shows a screenshot captioned only "An example permission confirmation prompt" and does not
   transcribe it, and I could not locate the corresponding `IDS_` constant in
   `generated_resources.grd` or `extensions_strings.grdp`. I am confident the *warning line
   itself* is the same `IDS_EXTENSION_PROMPT_WARNING_ALL_HOSTS` string, because
   `ChromePermissionMessageProvider` is the single source of permission messages for both the
   install and runtime paths, but the surrounding dialog chrome ("Add ... ?", button labels) is
   unverified. This does not affect the recommendation.

2. **The install dialog's title and heading strings.** `IDS_EXTENSION_INSTALL_PROMPT_TITLE` is
   referenced in discussions of the install flow but is not present in either
   `chrome/app/generated_resources.grd` or `chrome/app/extensions_strings.grdp` at `main`, and
   `chrome/browser/extensions/extension_install_prompt.cc` was not at the path I probed. Only
   the *warning list items* are quoted verbatim in this document, and those are fully verified.

3. **A separate "Host permission justification" field in the CWS dashboard.** The
   [privacy practices documentation](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
   describes one justification field per declared permission and does not mention a distinct
   host-permission field. I could not confirm from primary sources whether the live dashboard
   presents one. Worth checking directly in the dashboard before submission.

4. **Whether an already-granted optional host permission survives an extension update that
   changes the declared optional scope.** The docs state Chrome re-prompts only when new
   warnings appear, but I found no primary statement covering the case where
   `optional_host_permissions` itself is edited between versions. Test this with the
   extension-update-testing-tool that the
   [permission warnings page](https://developer.chrome.com/docs/extensions/develop/concepts/permission-warnings)
   recommends before shipping a 2.1.

5. **BeBold's own rating count.** The ticket gives 3.80 stars but no number of ratings, and I
   did not pull the store listing, so the competitor comparison in section 5.3 leaves that cell
   blank rather than guessing.

6. **Any non-public review guidance for the Accessibility category.** I established that no
   category-specific rule appears in the public program policies or review process pages. I
   cannot rule out internal reviewer guidance that is not published.
