/*
    Audio format reader is part of 3LAS (Low Latency Live Audio Streaming)
    https://github.com/JoJoBond/3LAS
*/

export interface IAudioFormatReader {
    PushData(data: Uint8Array): void;
    SamplesAvailable(): boolean;
    PopSamples(): AudioBuffer;
    PurgeData(): void;
    Reset(): void;
    Poke(): void;
}

// Used to concatenate two Uint8Array (b comes BEHIND a)
export function ConcatUint8Array(a: Uint8Array, b: Uint8Array): Uint8Array {
    let tmp = new Uint8Array(a.length + b.length);
    tmp.set(a, 0);
    tmp.set(b, a.length);
    return tmp;
}

export abstract class AudioFormatReader implements IAudioFormatReader {
    protected readonly Audio: AudioContext;
    protected readonly ErrorCallback: () => void;
    protected readonly BeforeDecodeCheck: (length: number) => boolean;
    protected readonly DataReadyCallback: () => void;

    // Unique ID for decoded buffers
    protected Id: number;

    // ID of the last inserted decoded samples buffer
    protected LastPushedId: number;

    // Array for individual bunches of samples
    protected Samples: Array<AudioBuffer>;

    // Storage for individual bunches of decoded samples that where decoded out of order
    protected BufferStore: Record<number, AudioBuffer>;

    // Data buffer for "raw" data
    protected DataBuffer: Uint8Array;


    constructor(audio: AudioContext, errorCallback: () => void, beforeDecodeCheck: (length: number) => boolean, dataReadyCallback: () => void) {
        if (!audio)
            throw new Error('AudioFormatReader: audio must be specified');

        // Check callback argument
        if (typeof errorCallback !== 'function')
            throw new Error('AudioFormatReader: errorCallback must be specified');

        if (typeof beforeDecodeCheck !== 'function')
            throw new Error('AudioFormatReader: beforeDecodeCheck must be specified');

        if (typeof dataReadyCallback !== 'function')
            throw new Error('AudioFormatReader: dataReadyCallback must be specified');

        this.Audio = audio;
        this.ErrorCallback = errorCallback;
        this.BeforeDecodeCheck = beforeDecodeCheck;
        this.DataReadyCallback = dataReadyCallback;

        this.Id = 0;
        this.LastPushedId = -1;
        this.Samples = new Array();
        this.BufferStore = {};
        this.DataBuffer = new Uint8Array(0);
    }

    // Pushes frame data into the buffer
    public PushData(data: Uint8Array): void {
        // Append data to framedata buffer
        this.DataBuffer = ConcatUint8Array(this.DataBuffer, data);

        // Try to extract frames
        this.ExtractAll();
    }

    // Check if samples are available
    public SamplesAvailable(): boolean {
        return (this.Samples.length > 0);
    }

    // Get a single bunch of sampels from the reader
    public PopSamples(): AudioBuffer {
        if (this.Samples.length > 0) {
            // Get first bunch of samples, remove said bunch from the array and hand it back to callee
            return this.Samples.shift();
        }
        else
            return null;
    }

    // Deletes all encoded and decoded data from the reader (does not effect headers, etc.)
    public PurgeData(): void {
        this.Id = 0;
        this.LastPushedId = -1;
        this.Samples = new Array();
        this.BufferStore = {};
        this.DataBuffer = new Uint8Array(0);
    }

    // Used to force frame extraction externaly
    public Poke(): void {
        this.ExtractAll();
    }

    // Deletes all data from the reader (does effect headers, etc.)
    public Reset(): void {
        this.PurgeData();
    }

    // Extracts and converts the raw data 
    protected abstract ExtractAll(): void

    // Checks if a decode makes sense
    protected OnBeforeDecode(id: number, duration: number): boolean {
        return true;

        //TODO Fix this
        /*
        if(this.BeforeDecodeCheck(duration)) {
            return true;
        }
        else {
            this.OnDataReady(id, this.Audio.createBuffer(1, Math.ceil(duration * this.Audio.sampleRate), this.Audio.sampleRate));
            return false;
        }
        */
    }

    // Stores the converted bnuches of samples in right order
    protected OnDataReady(id: number, audioBuffer: AudioBuffer): void {
        if (this.LastPushedId + 1 == id) {
            // Push samples into array
            this.Samples.push(audioBuffer);
            this.LastPushedId++;

            while (this.BufferStore[this.LastPushedId + 1]) {
                // Push samples we decoded earlier in correct order
                this.Samples.push(this.BufferStore[this.LastPushedId + 1]);
                delete this.BufferStore[this.LastPushedId + 1];
                this.LastPushedId++;
            }

            // Callback to tell that data is ready
            this.DataReadyCallback();
        }
        else {
            // Is out of order, will be pushed later
            this.BufferStore[id] = audioBuffer;
        }
    }
}
