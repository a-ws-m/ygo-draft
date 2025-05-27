-- Add drafted_deck_size column to the drafts table for tracking target deck size
ALTER TABLE drafts 
ADD COLUMN drafted_deck_size INTEGER;

-- Add a comment to explain the purpose of this column
COMMENT ON COLUMN drafts.drafted_deck_size IS 'The target number of cards each player should draft, used primarily for grid drafting';
