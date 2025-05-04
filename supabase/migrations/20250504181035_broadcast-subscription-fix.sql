-- Policy for authenticated users to receive broadcast messages for active drafts
CREATE POLICY "Authenticated users can SELECT broadcast messages for active drafts"
ON "realtime"."messages"
FOR SELECT
TO authenticated
USING (
    -- For broadcast/presence messages in draft rooms:
    -- 1. Topic must be a draft room
    realtime.messages.extension IN ('broadcast', 'presence') AND 
    realtime.topic() LIKE 'draft-room-%' AND
    
    -- 2. The draft must exist and be active
    EXISTS (
        SELECT 1 
        FROM public.drafts 
        WHERE id = (regexp_match(realtime.topic(), 'draft-room-([0-9a-f\-]+)'))[1]::uuid
    )
);
