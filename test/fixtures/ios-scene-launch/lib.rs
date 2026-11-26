use std::sync::atomic::{AtomicBool, Ordering};
use tao::{event::{Event, StartCause}, event_loop::{ControlFlow, EventLoop}, window::WindowBuilder};
static READY: AtomicBool = AtomicBool::new(false);
#[no_mangle]
pub extern "C" fn scene_probe_ready() -> bool { READY.load(Ordering::SeqCst) }
#[no_mangle]
pub extern "C" fn scene_probe_start() {
    let event_loop = EventLoop::new();
    let mut window = None;
    event_loop.run(move |event, target, flow| {
        *flow = ControlFlow::Wait;
        if let Event::NewEvents(StartCause::Init) = event {
            window = Some(WindowBuilder::new().with_title("NaviMuse scene lifecycle probe").build(target).unwrap());
            READY.store(true, Ordering::SeqCst);
        }
        let _keep_alive = &window;
    });
}
