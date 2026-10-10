import SwiftUI

struct SmokeScreen: View {
    var body: some View {
        VStack(spacing: 12) {
            Text("Smoke").accessibilityIdentifier("title")
            Button("First") {}.accessibilityIdentifier("btnFirst")
            Button("Second") {}.accessibilityIdentifier("btnSecond")
            Button("No identifier") {}
        }
    }
}
