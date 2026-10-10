import SwiftUI

// The screen is chosen by a launch argument (`-screen <name>`, read through the
// UserDefaults argument domain), so the harness never navigates.
@main
struct LocatorLabApp: App {
    init() { UIView.setAnimationsEnabled(false) }

    var body: some Scene {
        WindowGroup {
            Screens.view(for: UserDefaults.standard.string(forKey: "screen") ?? "smoke")
        }
    }
}
