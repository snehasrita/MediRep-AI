"use client";

import { useEffect, useState } from "react";
import AgoraRTC, {
    AgoraRTCProvider,
    useJoin,
    useLocalMicrophoneTrack,
    useNetworkQuality,
    usePublish,
    useRemoteAudioTracks,
    useRemoteUsers,
} from "agora-rtc-react";
import { Mic, MicOff, PhoneOff, Signal, User } from "lucide-react";
import { Button } from "@/components/ui/button";

interface VoiceCallProps {
    appId: string;
    channel: string;
    token: string;
    uid: number;
    onEndCall: () => void;
}

export function VoiceCall({ appId, channel, token, uid, onEndCall }: VoiceCallProps) {
    const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });

    return (
        <AgoraRTCProvider client={client}>
            <CallInterface
                appId={appId}
                channel={channel}
                token={token}
                uid={uid}
                onEndCall={onEndCall}
            />
        </AgoraRTCProvider>
    );
}

function CallInterface({ appId, channel, token, uid, onEndCall }: VoiceCallProps) {
    // Join Hook
    useJoin({ appid: appId, channel: channel, token: token, uid: uid });

    // Mic Hook
    const { localMicrophoneTrack } = useLocalMicrophoneTrack(true);
    const [micOn, setMicOn] = useState(true);

    // Publish Hook
    usePublish([localMicrophoneTrack]);

    // Remote Users Hook
    const remoteUsers = useRemoteUsers();
    const { audioTracks } = useRemoteAudioTracks(remoteUsers);

    // Auto-play remote audio
    useEffect(() => {
        audioTracks.map((track) => track.play());
    }, [audioTracks]);

    // Toggle Mic
    const toggleMic = () => {
        if (localMicrophoneTrack) {
            localMicrophoneTrack.setEnabled(!micOn);
            setMicOn(!micOn);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center p-8 bg-slate-900 rounded-xl border border-slate-800 shadow-2xl space-y-8 animate-in fade-in zoom-in duration-300">
            <div className="text-center space-y-2">
                <div className="relative">
                    <div className="h-24 w-24 bg-slate-800 rounded-full flex items-center justify-center mx-auto text-slate-400 border-4 border-slate-700">
                        <User className="h-10 w-10" />
                    </div>
                    {remoteUsers.length > 0 && (
                        <div className="absolute bottom-0 right-1/2 translate-x-12 translate-y-1 h-6 w-6 bg-green-500 rounded-full border-4 border-slate-900" />
                    )}
                </div>
                <h2 className="text-2xl font-bold text-slate-200">
                    {remoteUsers.length > 0 ? "Connected" : "Calling..."}
                </h2>
                <p className="text-slate-500 text-sm">
                    {remoteUsers.length > 0
                        ? `${remoteUsers.length} participant(s) in call`
                        : "Waiting for other party to join..."}
                </p>
            </div>

            <div className="flex items-center gap-6">
                <Button
                    size="icon"
                    variant={micOn ? "secondary" : "destructive"}
                    className={`h-14 w-14 rounded-full ${micOn ? "bg-slate-700 hover:bg-slate-600" : ""}`}
                    onClick={toggleMic}
                >
                    {micOn ? <Mic className="h-6 w-6" /> : <MicOff className="h-6 w-6" />}
                </Button>

                <Button
                    size="icon"
                    variant="destructive"
                    className="h-16 w-16 rounded-full shadow-lg shadow-red-900/50 hover:bg-red-600"
                    onClick={onEndCall}
                >
                    <PhoneOff className="h-8 w-8" />
                </Button>
            </div>
        </div>
    );
}
