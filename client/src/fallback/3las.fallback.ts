/*
    Socket fallback is part of 3LAS (Low Latency Live Audio Streaming)
    https://github.com/JoJoBond/3LAS
*/

import { Logging } from '../util/3las.logging';
import { CreateAudioFormatReader, CanDecodeTypes } from './formats';
import { IAudioFormatReader } from './formats/audioformatreader';
import { LiveAudioPlayer, NewAudioContext } from './liveaudioplayer';
import { OSName, BrowserName } from '../util/3las.helpers';

export class Fallback_Settings {
    public Formats: Array<{ Mime: string, Name: string }>;
    public MaxVolume: number;
    public AutoCorrectSpeed: boolean;
    public InitialBufferLength: number;

    constructor() {
        this.Formats = [
            { "Mime": "audio/mpeg", "Name": "mp3" },
            { "Mime": "audio/wave", "Name": "wav" }
        ];
        this.MaxVolume = 1.0;
        this.AutoCorrectSpeed = false;
        this.InitialBufferLength = 1.0 / 3.0;
    }
}

export class Fallback {
    private readonly Audio: AudioContext;

    private readonly Logger: Logging;

    private readonly Settings: Fallback_Settings;
    private readonly FormatReader: IAudioFormatReader;
    private readonly Player: LiveAudioPlayer;

    private readonly SelectedFormatMime: string;
    private readonly SelectedFormatName: string;

    constructor(logger: Logging, settings: Fallback_Settings) {
        this.Logger = logger;
        if (!this.Logger) {
            this.Logger = new Logging(null, null);
        }

        // Create audio context
        this.Audio = NewAudioContext();
        this.Settings = settings;

        this.Logger.Log("Detected: " +
            (OSName == "MacOSX" ? "Mac OSX" : (OSName == "Unknown" ? "Unknown OS" : OSName)) + ", " +
            (BrowserName == "IE" ? "Internet Explorer" : (BrowserName == "NativeChrome" ? "Chrome legacy" : (BrowserName == "Unknown" ? "Unknown Browser" : BrowserName))));

        this.SelectedFormatMime = "";
        this.SelectedFormatName = "";

        for (let i: number = 0; i < this.Settings.Formats.length; i++) {
            if (!CanDecodeTypes([this.Settings.Formats[i].Mime]))
                continue;

            this.SelectedFormatMime = this.Settings.Formats[i].Mime;
            this.SelectedFormatName = this.Settings.Formats[i].Name;
            break;
        }

        if (this.SelectedFormatMime == "" || this.SelectedFormatName == "") {
            this.Logger.Log("None of the available MIME types are supported.");
            throw new Error();
        }

        this.Logger.Log("Using websocket fallback with MIME: " + this.SelectedFormatMime);

        try {
            this.Player = new LiveAudioPlayer(
                this.Audio,
                this.Logger,
                this.Settings.MaxVolume,
                this.Settings.InitialBufferLength,
                this.Settings.AutoCorrectSpeed
            );
            this.Logger.Log("Init of LiveAudioPlayer succeeded");
        }
        catch (e) {
            this.Logger.Log("Init of LiveAudioPlayer failed: " + e);
            throw new Error();
        }

        try {
            this.FormatReader = CreateAudioFormatReader(
                this.SelectedFormatMime,
                this.Audio,
                this.OnReaderError.bind(this),
                this.Player.CheckBeforeDecode,
                this.OnReaderDataReady.bind(this)
            );
            this.Logger.Log("Init of AudioFormatReader succeeded");
        }
        catch (e) {
            this.Logger.Log("Init of AudioFormatReader failed: " + e);
            throw new Error();
        }

        this.PacketModCounter = 0;
        this.LastCheckTime = 0;
        this.FocusChecker = 0;
    }

    public Init(): string {
        this.MobileUnmute();
        this.StartFocusChecker();
        return this.SelectedFormatName
    }

    public MobileUnmute(): void {
        let amplification = this.Audio.createGain();

        // Set volume to max
        amplification.gain.value = 1.0;

        // Connect gain node to context
        amplification.connect(this.Audio.destination);

        // Create one second buffer with silence		
        let audioBuffer = this.Audio.createBuffer(2, this.Audio.sampleRate, this.Audio.sampleRate);

        // Create new audio source for the buffer
        let sourceNode = this.Audio.createBufferSource();

        // Make sure the node deletes itself after playback
        sourceNode.onended = function (_ev: Event) {
            sourceNode.disconnect();
            amplification.disconnect();
        };

        // Pass audio data to source
        sourceNode.buffer = audioBuffer;

        // Connect the source to the gain node
        sourceNode.connect(amplification);

        // Play source		
        sourceNode.start();
    }

    public set Volume(value: number) {
        this.Player.Volume = value * this.Settings.MaxVolume;
    }

    public get Volume(): number {
        return this.Player.Volume / this.Settings.MaxVolume;
    }

    // Callback functions from format reader
    private OnReaderError(): void {
        this.Logger.Log("Reader error: Decoding failed.");
    }

    private OnReaderDataReady(): void {
        while (this.FormatReader.SamplesAvailable()) {
            this.Player.PushBuffer(this.FormatReader.PopSamples());
        }
    }

    private PacketModCounter: number;
    public OnSocketDataReady(data: ArrayBuffer): void {
        this.PacketModCounter++;

        if (this.PacketModCounter > 100) {
            this.PacketModCounter = 0;
        }

        this.FormatReader.PushData(new Uint8Array(data));
    }


    // Check if page has lost focus (e.g. switching apps on mobile)
    private LastCheckTime: number;
    private FocusChecker: number;

    private StartFocusChecker(): void {
        if (!this.FocusChecker) {
            this.LastCheckTime = Date.now();
            this.FocusChecker = window.setInterval(this.CheckFocus.bind(this), 2000);
        }
    }

    private StopFocusChecker(): void {
        if (this.FocusChecker) {
            window.clearInterval(this.FocusChecker);
            this.FocusChecker = 0;
        }
    }

    private CheckFocus(): void {
        let checkTime: number = Date.now();
        // Check if focus was lost
        if (checkTime - this.LastCheckTime > 10000) {
            // If so, drop all samples in the buffer
            this.Logger.Log("Focus lost, purging format reader.")
            this.FormatReader.PurgeData();
        }
        this.LastCheckTime = checkTime;
    }

    public Reset(): void {
        this.StopFocusChecker();

        this.FormatReader.Reset();
        this.Player.Reset();
    }
}