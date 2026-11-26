import Cocoa
import WebKit
let app=NSApplication.shared
app.setActivationPolicy(.accessory)
let config=WKWebViewConfiguration()
config.websiteDataStore = .nonPersistent()
let blocked=CommandLine.arguments.contains("--blocked")
let stub="Object.defineProperty(window,'__nmAudioTransport',{value:{version:1,offlineDownloads:true,request:async()=>({offlineLaunch:false})}});" + (blocked ? "window.fetch=()=>new Promise(()=>{});" : "")
config.userContentController.addUserScript(WKUserScript(source:stub,injectionTime:.atDocumentStart,forMainFrameOnly:true))
let web=WKWebView(frame:NSRect(x:0,y:0,width:390,height:844),configuration:config)
let start=ProcessInfo.processInfo.systemUptime
class Delegate:NSObject,WKNavigationDelegate {
 func webView(_ webView:WKWebView,didFinish navigation:WKNavigation!){
  DispatchQueue.main.asyncAfter(deadline:.now() + (blocked ? 0.3 : 3)){
   webView.evaluateJavaScript("JSON.stringify({origin:location.origin,text:document.body.innerText.slice(0,300),loading:!!document.querySelector('[role=status]'),downloads:document.body.innerText.includes('Open downloaded music')})"){result,error in
    if error != nil { exit(1) }
    if blocked, let text=result as? String, (!text.contains("\"loading\":true") || !text.contains("\"downloads\":true")) { exit(2) }
    print("elapsed=\(ProcessInfo.processInfo.systemUptime-start) \(result ?? "no result") \(error?.localizedDescription ?? "")")
    app.terminate(nil)
   }
  }
 }
}
let delegate=Delegate();web.navigationDelegate=delegate
let html=try String(contentsOfFile:CommandLine.arguments[1],encoding:.utf8)
web.loadHTMLString(html,baseURL:URL(string:"https://navimuse.example.com"))
DispatchQueue.main.asyncAfter(deadline:.now()+12){print("TIMEOUT");exit(3)}
app.run()
