import { isAndroid } from '../../util/3las.helpers';

import { IAudioFormatReader } from './audioformatreader';
import { AudioFormatReader_MPEG } from './format.mpeg';
import { AudioFormatReader_WAV } from './format.wav';

export function CreateAudioFormatReader(mime: string, audio: AudioContext, errorCallback: () => void, beforeDecodeCheck: (length: number) => boolean, dataReadyCallback: () => void, settings: Record<string, Record<string, number | boolean>> = null): IAudioFormatReader {
    if (typeof mime !== "string")
        throw new Error('CreateAudioFormatReader: Invalid MIME-Type, must be string');

    if (!settings)
        settings = DefaultAudioFormatReaderSettings();

    if (mime.indexOf("audio/pcm") == 0)
        mime = "audio/pcm";

    // Load format handler according to MIME-Type
    switch (mime.replace(/\s/g, "")) {
        // MPEG Audio (mp3)
        case "audio/mpeg":
        case "audio/MPA":
        case "audio/mpa-robust":
            if (!CanDecodeTypes(new Array("audio/mpeg", "audio/MPA", "audio/mpa-robust")))
                throw new Error('CreateAudioFormatReader: Browser can not decode specified MIME-Type (' + mime + ')');

            return new AudioFormatReader_MPEG(audio, errorCallback, beforeDecodeCheck, dataReadyCallback, <boolean>settings["mpeg"]["AddID3Tag"], <number>settings["mpeg"]["MinDecodeFrames"]);

        // Waveform Audio File Format
        case "audio/vnd.wave":
        case "audio/wav":
        case "audio/wave":
        case "audio/x-wav":
            if (!CanDecodeTypes(new Array("audio/wav", "audio/wave")))
                throw new Error('CreateAudioFormatReader: Browser can not decode specified MIME-Type (' + mime + ')');

            return new AudioFormatReader_WAV(audio, errorCallback, beforeDecodeCheck, dataReadyCallback, <number>settings["wav"]["BatchDuration"], <number>settings["wav"]["ExtraEdgeDuration"]);

        // Unknown codec
        default:
            throw new Error('CreateAudioFormatReader: Specified MIME-Type (' + mime + ') not supported');
    }
}

export function DefaultAudioFormatReaderSettings(): Record<string, Record<string, number | boolean>> {
    let settings: Record<string, Record<string, number | boolean>> = {};

    // WAV
    settings["wav"] = {};

    // Duration of wave samples to decode together
    settings["wav"]["BatchDuration"] = 1 / 10; // 0.1 seconds
    /*
    if (isAndroid && isNativeChrome)
        settings["wav"]["BatchDuration"] = 96 / 375;
    else if (isAndroid && isFirefox)
        settings["wav"]["BatchDuration"] = 96 / 375;
    else
        settings["wav"]["BatchDuration"] = 16 / 375;
    */

    // Duration of addtional samples to decode to account for edge effects
    settings["wav"]["ExtraEdgeDuration"] = 1 / 300; // 0.00333... seconds
    /*
    if (isAndroid && isNativeChrome)
        settings["wav"]["ExtraEdgeDuration"] = 1 / 1000;
    else if (isAndroid && isFirefox)
        settings["wav"]["ExtraEdgeDuration"] = 1 / 1000;
    else
        settings["wav"]["ExtraEdgeDuration"] = 1 / 1000;
    */

    // MPEG
    settings["mpeg"] = {};

    // Adds a minimal ID3v2 tag before decoding frames.
    settings["mpeg"]["AddID3Tag"] = false;

    // Minimum number of frames to decode together
    // Theoretical minimum is 2.
    // Recommended value is 3 or higher.
    if (isAndroid)
        settings["mpeg"]["MinDecodeFrames"] = 17;
    else
        settings["mpeg"]["MinDecodeFrames"] = 3;

    return settings;
}

export function CanDecodeTypes(mimeTypes: Array<string>): boolean {
    let audioTag = new Audio();
    let result: boolean = false;
    for (let i: number = 0; i < mimeTypes.length; i++) {
        let mimeType: string = mimeTypes[i];

        let answer: string = audioTag.canPlayType(mimeType);
        if (answer != "probably" && answer != "maybe")
            continue;

        result = true;
        break;
    }

    audioTag = null;
    return result;
}
