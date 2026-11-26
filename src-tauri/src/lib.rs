use tauri::webview::PageLoadEvent;
#[cfg(target_os = "ios")]
use tauri::Manager;
#[cfg(target_os = "ios")]
extern "C" { fn navimuse_install_online_shell(html: *const std::ffi::c_char); fn navimuse_install_offline_shell(html: *const std::ffi::c_char); fn navimuse_install_ios_shell(view: *mut std::ffi::c_void, javascript: *const std::ffi::c_char); }


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let m7_webgl_loss_evidence = std::env::args().any(|arg| arg == "--m7-webgl-loss");

    tauri::Builder::default()
        .setup(|app| {
            #[cfg(target_os = "ios")]
            if let Some(view) = app.get_webview_window("main") {
                view.with_webview(|platform| {
                    let script = std::ffi::CString::new(include_str!("../ios/track-controls.js")).expect("valid bridge script");
                    let offline = std::ffi::CString::new(include_str!("../../.scratch/ios-offline-shell.html")).expect("valid offline shell");
                    let online = std::ffi::CString::new(include_str!("../../.scratch/ios-online-shell.html")).expect("valid online shell");
                    unsafe { navimuse_install_online_shell(online.as_ptr()); navimuse_install_offline_shell(offline.as_ptr()); navimuse_install_ios_shell(platform.inner(), script.as_ptr()); }
                })?;
            }
            #[cfg(not(target_os = "ios"))]
            let _ = app;
            Ok(())
        })
        .on_page_load(move |webview, payload| {
            if !m7_webgl_loss_evidence {
                return;
            }
            if payload.event() != PageLoadEvent::Finished {
                return;
            }
            let url = payload.url();
            // The packaged shell starts on the bundled `tauri:` document. That
            // document performs the first-party BFF redirect in JavaScript and
            // deliberately preserves its query string. Seed the evidence query
            // before that redirect so the flag survives the secure bootstrap.
            if !matches!(url.scheme(), "tauri" | "http" | "https") {
                return;
            }
            if url
                .query_pairs()
                .any(|(key, value)| key == "navimuse-m7-webgl-loss" && value == "1")
            {
                return;
            }

            let preserved_pairs = url
                .query_pairs()
                .filter(|(key, _)| key != "view" && key != "navimuse-m7-webgl-loss")
                .map(|(key, value)| (key.into_owned(), value.into_owned()))
                .collect::<Vec<_>>();
            let mut evidence_url = url.clone();
            {
                let mut query = evidence_url.query_pairs_mut();
                query.clear().extend_pairs(preserved_pairs);
                query.append_pair("view", "sonic");
                query.append_pair("navimuse-m7-webgl-loss", "1");
            }
            if let Err(error) = webview.navigate(evidence_url) {
                eprintln!("NaviMuse M7 WebGL evidence navigation failed: {error}");
            }
        })
        .run(tauri::generate_context!())
        .expect("failed to run NaviMuse Tauri shell");
}
