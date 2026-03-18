WITH host_ids AS (
  SELECT host_user_id AS user_id
  FROM public.host_settings
  UNION
  SELECT user_id
  FROM public.user_roles
  WHERE role = 'host'
),
product_seed(name) AS (
  VALUES
    ('Bathroom Spray'),
    ('Multi-Surface Spray'),
    ('Bleach'),
    ('Fabric Freshener'),
    ('Air Refresher'),
    ('Dish Soap'),
    ('Bags 25lt'),
    ('Bags 50lt'),
    ('Kitchen Roll'),
    ('Toilet papper'),
    ('Napkins (coffe table)'),
    ('Nespresso Capsules'),
    ('Cookies (coffee)'),
    ('Te bags'),
    ('Candles'),
    ('Gloves'),
    ('Blue Capsules')
)
INSERT INTO public.products (host_user_id, name, category, active)
SELECT host_ids.user_id, product_seed.name, NULL, true
FROM host_ids
CROSS JOIN product_seed
WHERE NOT EXISTS (
  SELECT 1
  FROM public.products p
  WHERE p.host_user_id = host_ids.user_id
    AND lower(trim(p.name)) = lower(trim(product_seed.name))
);
