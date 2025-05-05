-- Create two buckets for card images
insert into storage.buckets (id, name, public)
values 
  ('card_images', 'card_images', true),
  ('card_images_small', 'card_images_small', true);

-- Set up security policies to allow public read access but restrict writes to authenticated users
create policy "Public Access for card_images"
  on storage.objects for select
  using ( bucket_id = 'card_images' );

create policy "Public Access for card_images_small"
  on storage.objects for select
  using ( bucket_id = 'card_images_small' );

create policy "Service Role can upload card_images"
  on storage.objects for insert
  with check ( bucket_id = 'card_images' AND auth.role() = 'service_role' );

create policy "Service Role can upload card_images_small"
  on storage.objects for insert
  with check ( bucket_id = 'card_images_small' AND auth.role() = 'service_role' );