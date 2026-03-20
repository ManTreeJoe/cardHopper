cask "card-hopper" do
  version "1.3.0"
  sha256 :no_check # Replace with actual sha256 after build

  url "https://github.com/ManTreeJoe/cardHopper/releases/download/v#{version}/Card.Hopper-#{version}-arm64.dmg"
  name "Card Hopper"
  desc "SD Card auto-ingest app — automatically copies media from SD cards to your computer"
  homepage "https://github.com/ManTreeJoe/cardHopper"

  app "Card Hopper.app"

  zap trash: [
    "~/Library/Application Support/Card Hopper",
    "~/Library/Logs/Card Hopper",
    "~/Library/Preferences/com.cardhopper.app.plist",
    "~/Library/Saved Application State/com.cardhopper.app.savedState",
  ]
end
