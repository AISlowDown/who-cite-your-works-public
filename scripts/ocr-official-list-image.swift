import AppKit
import Foundation
import Vision

guard CommandLine.arguments.count == 2 || CommandLine.arguments.count == 3 else {
    fputs("usage: swift scripts/ocr-official-list-image.swift <image> [--tsv]\n", stderr)
    exit(2)
}

let imageURL = URL(fileURLWithPath: CommandLine.arguments[1])
let tabular = CommandLine.arguments.contains("--tsv")
guard let image = NSImage(contentsOf: imageURL),
      let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    fputs("cannot read image: \(imageURL.path)\n", stderr)
    exit(1)
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = true
request.recognitionLanguages = ["zh-Hans", "en-US"]

try VNImageRequestHandler(cgImage: cgImage).perform([request])
let observations = (request.results ?? []).sorted {
    let verticalGap = abs($0.boundingBox.midY - $1.boundingBox.midY)
    if verticalGap > 0.004 { return $0.boundingBox.midY > $1.boundingBox.midY }
    return $0.boundingBox.minX < $1.boundingBox.minX
}
for observation in observations {
    if let candidate = observation.topCandidates(1).first {
        if tabular {
            let box = observation.boundingBox
            print(String(format: "%.6f\t%.6f\t%.6f\t%.6f\t%@", box.minX, box.minY,
                         box.width, box.height, candidate.string))
        } else { print(candidate.string) }
    }
}
