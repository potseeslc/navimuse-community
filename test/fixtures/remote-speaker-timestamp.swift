import Foundation
@main struct TimestampTest {
    struct Snapshot: Codable { @RemoteSpeakerTimestamp var timestamp: Date }
    static func main() throws {
        let decoder = JSONDecoder()
        let fractional = try decoder.decode(Snapshot.self, from: Data(#"{"timestamp":"2026-09-14T02:00:00.123Z"}"#.utf8))
        let whole = try decoder.decode(Snapshot.self, from: Data(#"{"timestamp":"2026-09-14T02:00:00Z"}"#.utf8))
        precondition(abs(fractional.timestamp.timeIntervalSince(whole.timestamp)-0.123)<0.0001)
        let encoded = try JSONEncoder().encode(fractional)
        let roundtrip = try decoder.decode(Snapshot.self, from: encoded)
        precondition(roundtrip.timestamp == fractional.timestamp)
        for invalid in [#"{"timestamp":"invalid"}"#, #"{"timestamp":123}"#, #"{}"#] {
            do { _ = try decoder.decode(Snapshot.self, from: Data(invalid.utf8)); fatalError("Invalid timestamp accepted") }
            catch is DecodingError { }
        }
        print("Remote timestamp: fractional/whole ISO-8601, round trip, malformed/missing rejection passed")
    }
}
