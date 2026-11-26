import Foundation

// A stable wire format shared by the JS bridge and APNs, independent of the
// JSONDecoder date strategy Apple uses when it creates the extension attributes.
@propertyWrapper
struct RemoteSpeakerTimestamp: Codable {
    var wrappedValue: Date
    init(wrappedValue: Date) { self.wrappedValue = wrappedValue }
    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let value = try container.decode(String.self)
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: value) { wrappedValue = date; return }
        formatter.formatOptions = [.withInternetDateTime]
        guard let date = formatter.date(from: value) else {
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid remote observation timestamp")
        }
        wrappedValue = date
    }
    func encode(to encoder: Encoder) throws {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        var container = encoder.singleValueContainer()
        try container.encode(formatter.string(from: wrappedValue))
    }
}
