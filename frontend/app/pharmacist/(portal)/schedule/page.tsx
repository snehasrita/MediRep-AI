"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Clock, Save, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { pharmacistApi, ScheduleSlot } from "@/lib/pharmacist-api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// 0=Sunday mapping
const DAYS = [
    "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"
];

// Default slots template
const DEFAULT_SLOTS: ScheduleSlot[] = [
    // Mon-Fri 9-5
    { day_of_week: 1, start_time: "09:00", end_time: "17:00", is_active: true },
    { day_of_week: 2, start_time: "09:00", end_time: "17:00", is_active: true },
    { day_of_week: 3, start_time: "09:00", end_time: "17:00", is_active: true },
    { day_of_week: 4, start_time: "09:00", end_time: "17:00", is_active: true },
    { day_of_week: 5, start_time: "09:00", end_time: "17:00", is_active: true },
];

export default function ScheduleManager() {
    const [slots, setSlots] = useState<ScheduleSlot[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        loadSchedule();
    }, []);

    const loadSchedule = async () => {
        try {
            setLoading(true);
            const data = await pharmacistApi.getSchedule();
            setSlots(data.length > 0 ? data : []);
        } catch (error) {
            console.error(error);
            // Silently fail - no popup
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            await pharmacistApi.setSchedule(slots);
            toast.success("Schedule updated successfully");
        } catch (error) {
            console.error(error);
            // Silently fail - no popup
        } finally {
            setSaving(false);
        }
    };

    const addSlot = (dayIndex: number) => {
        setSlots(prev => [
            ...prev,
            { day_of_week: dayIndex, start_time: "09:00", end_time: "17:00", is_active: true }
        ]);
    };

    const removeSlot = (index: number) => {
        const newSlots = [...slots];
        newSlots.splice(index, 1);
        setSlots(newSlots); // Direct state update
    };

    const updateSlot = (index: number, field: keyof ScheduleSlot, value: any) => {
        const newSlots = [...slots];
        newSlots[index] = { ...newSlots[index], [field]: value };
        setSlots(newSlots);
    };

    const applyTemplate = () => {
        if (confirm("This will replace your current schedule. Continue?")) {
            setSlots([...DEFAULT_SLOTS]);
        }
    };

    // Group slots by day for rendering
    // BUT we need to map back to original indices for editing? 
    // Easier to just find them or store them flat and filter in render.

    if (loading) {
        return <div className="p-8 text-muted-foreground">Loading schedule...</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Availability</h2>
                    <p className="text-muted-foreground">Manage your weekly recurring schedule.</p>
                </div>
                <div className="flex gap-3">
                    <Button variant="outline" onClick={applyTemplate}>
                        <RotateCcw className="mr-2 h-4 w-4" /> Load 9-5 Template
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={saving}
                        className="bg-[color:var(--landing-moss)] hover:bg-[rgb(var(--landing-moss-rgb)/0.9)] text-[color:var(--landing-bone)]"
                    >
                        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        Save Changes
                    </Button>
                </div>
            </div>

            <div className="grid gap-6">
                {DAYS.map((dayName, dayIndex) => {
                    // Find slots for this day
                    // We need to keep track of their original index in 'slots' array to update them
                    // Or just update by finding match. Let's use indices carefully.

                    const daySlots = slots
                        .map((s, i) => ({ ...s, originalIndex: i }))
                        .filter(s => s.day_of_week === dayIndex)
                        .sort((a, b) => a.start_time.localeCompare(b.start_time));

                    return (
                        <Card key={dayIndex} className="bg-card border-border">
                            <CardHeader className="pb-3 flex flex-row items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className={`h-3 w-3 rounded-full ${daySlots.length > 0 ? 'bg-green-500' : 'bg-muted-foreground/30'}`} />
                                    <CardTitle className="text-base font-medium">{dayName}</CardTitle>
                                </div>
                                <Button size="sm" variant="ghost" className="h-8 border border-dashed border-border hover:bg-muted" onClick={() => addSlot(dayIndex)}>
                                    <Plus className="mr-2 h-3 w-3" /> Add Slot
                                </Button>
                            </CardHeader>

                            {daySlots.length > 0 && (
                                <CardContent className="pt-3 pb-3 space-y-3">
                                    {daySlots.map((slot) => (
                                        <div key={slot.originalIndex} className="flex items-center gap-4 bg-muted/50 p-2 rounded border border-border">
                                            <Clock className="h-4 w-4 text-muted-foreground ml-2" />

                                            <div className="flex items-center gap-2">
                                                <Input
                                                    type="time"
                                                    value={slot.start_time}
                                                    onChange={(e) => updateSlot(slot.originalIndex, 'start_time', e.target.value)}
                                                    className="w-32 bg-background border-border h-8 text-sm"
                                                />
                                                <span className="text-muted-foreground text-xs">TO</span>
                                                <Input
                                                    type="time"
                                                    value={slot.end_time}
                                                    onChange={(e) => updateSlot(slot.originalIndex, 'end_time', e.target.value)}
                                                    className="w-32 bg-background border-border h-8 text-sm"
                                                />
                                            </div>

                                            <div className="ml-auto">
                                                <Button size="sm" variant="ghost" className="h-8 w-8 text-red-500 hover:text-red-400 hover:bg-red-500/10" onClick={() => removeSlot(slot.originalIndex)}>
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </CardContent>
                            )}
                        </Card>
                    );
                })}
            </div>
        </div>
    );
}
