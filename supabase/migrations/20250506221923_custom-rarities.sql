-- Add custom_rarity column to cubes table
ALTER TABLE cubes ADD COLUMN custom_rarity TEXT;

-- Add comment to the column
COMMENT ON COLUMN cubes.custom_rarity IS 'Custom rarity assigned to the card, overriding the default rarity';