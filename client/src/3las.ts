import { Fallback, Fallback_Settings } from "./fallback/3las.fallback";
import { Logging } from "./util/3las.logging";
import { WebSocketClient } from "./util/3las.websocketclient";
import { MyWakeLock, isAndroid } from "./util/3las.helpers";

export class _3LAS_Settings {
    public SocketHost: string;
    public SocketPort: number;
    public SocketPath: string;
    public Fallback: Fallback_Settings;

    constructor() {
        this.SocketHost = document.location.hostname ? document.location.hostname : "127.0.0.1";
        this.SocketPort = 8080;
        this.SocketPath = "/";
        this.Fallback = new Fallback_Settings();
    }
}

export class _3LAS {
    public ConnectivityCallback: (status: boolean) => void;

    private readonly Logger: Logging;
    private readonly Settings: _3LAS_Settings;

    private WebSocket: WebSocketClient;
    private ConnectivityFlag: boolean;

    private readonly Fallback: Fallback;
    private readonly WakeLock: MyWakeLock;

    constructor(logger: Logging, settings: _3LAS_Settings) {
        this.Logger = logger;
        if (!this.Logger) {
            this.Logger = new Logging(null, null);
        }

        this.Settings = settings;

        try {
            this.Fallback = new Fallback(this.Logger, this.Settings.Fallback);
        }
        catch
        {
            this.Fallback = null;
        }

        if (this.Fallback == null) {
            this.Logger.Log('3LAS: Browser does not support media handling methods.');
            throw new Error();
        }

        if (isAndroid) {
            this.WakeLock = new MyWakeLock(this.Logger);
        }
    }

    public set Volume(value: number) {
        this.Fallback.Volume = value;
    }

    public get Volume(): number {
        return this.Fallback.Volume;
    }

    public CanChangeVolume(): boolean {
        return true;
    }

    public Start(): void {
        this.ConnectivityFlag = false;

        // This is stupid, but required for Android.... thanks Google :(
        if (this.WakeLock)
            this.WakeLock.Begin();

        try {
            this.WebSocket = new WebSocketClient(
                'ws://' + this.Settings.SocketHost + ':' + this.Settings.SocketPort.toString() + this.Settings.SocketPath,
                this.OnSocketError.bind(this),
                this.OnSocketConnect.bind(this),
                this.OnSocketDataReady.bind(this),
                this.OnSocketDisconnect.bind(this)
            );
            this.Logger.Log("Init of WebSocketClient succeeded");
            this.Logger.Log("Trying to connect to server.");
        }
        catch (e) {
            this.Logger.Log("Init of WebSocketClient failed: " + e);
            throw new Error();
        }
    }

    // Callback function from socket connection
    private OnSocketError(message: string): void {
        this.Logger.Log("Network error: " + message);
    }

    private OnSocketConnect(): void {
        this.Logger.Log("Established connection with server.");
        let SelectedFormatName: string = this.Fallback.Init();

        this.WebSocket.Send(JSON.stringify({
            "type": "fallback",
            "data": SelectedFormatName,
        }));

        if (this.ConnectivityCallback)
            this.ConnectivityCallback(true);
    }

    private OnSocketDisconnect(): void {
        this.Logger.Log("Lost connection to server.");
        this.Fallback.Reset();


        if (this.ConnectivityFlag) {
            this.ConnectivityFlag = false;

            if (this.ConnectivityCallback)
                this.ConnectivityCallback(false);
        }

        this.Start();
    }

    private OnSocketDataReady(data: ArrayBuffer | string): void {
        this.Fallback.OnSocketDataReady(<ArrayBuffer>data);
    }
}
