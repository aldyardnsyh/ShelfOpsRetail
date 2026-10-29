-- 000015_demo_recent_movements (down)

DELETE FROM inventory_movements
WHERE id IN (
  SELECT md5('mv-recent-' || b.store_id::text || '-' || b.product_id::text || '-' || p.hours_ago)::uuid
  FROM inventory_balances b
  CROSS JOIN (VALUES (44),(37),(30),(26),(19),(13),(7),(3),(1)) AS p(hours_ago)
  WHERE b.workspace_id = '00000000-0000-7000-8000-000000000001'::uuid
);