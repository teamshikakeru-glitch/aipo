-- ============================================
-- あいぽ 大型ピボット: 個人開発ショーケース化
-- 統合マイグレーションSQL（全ステップ含む）
-- ============================================

-- ============================================
-- STEP 1: ideasテーブルにプロダクト関連カラムを追加
-- ============================================
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS is_product BOOLEAN DEFAULT false;
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS product_url TEXT;
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS screenshot_url TEXT;
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS product_tagline TEXT;
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS tech_stack TEXT[];
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS product_clicks INTEGER DEFAULT 0;
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS rating_ux NUMERIC(3,1) DEFAULT 0;
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS rating_design NUMERIC(3,1) DEFAULT 0;
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS rating_innovation NUMERIC(3,1) DEFAULT 0;
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS rating_count INTEGER DEFAULT 0;
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS screenshots TEXT[] DEFAULT '{}';
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS rating_avg NUMERIC(3,2) DEFAULT 0;
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS product_status TEXT DEFAULT 'active';

-- ============================================
-- STEP 2: product_ratingsテーブルを新規作成
-- ============================================
CREATE TABLE IF NOT EXISTS product_ratings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID REFERENCES ideas(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ux_score INTEGER CHECK (ux_score BETWEEN 1 AND 5),
  design_score INTEGER CHECK (design_score BETWEEN 1 AND 5),
  innovation_score INTEGER CHECK (innovation_score BETWEEN 1 AND 5),
  comment TEXT,
  review_text TEXT,
  helpful_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(product_id, user_id)
);

ALTER TABLE product_ratings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Anyone can read ratings' AND tablename = 'product_ratings') THEN
    CREATE POLICY "Anyone can read ratings" ON product_ratings FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can insert' AND tablename = 'product_ratings') THEN
    CREATE POLICY "Authenticated users can insert" ON product_ratings FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update own' AND tablename = 'product_ratings') THEN
    CREATE POLICY "Users can update own" ON product_ratings FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$;

-- ============================================
-- STEP 3: review_helpfulテーブル
-- ============================================
CREATE TABLE IF NOT EXISTS review_helpful (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  rating_id UUID REFERENCES product_ratings(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(rating_id, user_id)
);

ALTER TABLE review_helpful ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Anyone can read helpful' AND tablename = 'review_helpful') THEN
    CREATE POLICY "Anyone can read helpful" ON review_helpful FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Auth users can insert helpful' AND tablename = 'review_helpful') THEN
    CREATE POLICY "Auth users can insert helpful" ON review_helpful FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ============================================
-- STEP 4: RPC関数
-- ============================================

-- プロダクトクリック数のインクリメント
CREATE OR REPLACE FUNCTION increment_product_clicks(p_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE ideas SET product_clicks = COALESCE(product_clicks, 0) + 1 WHERE id = p_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- プロダクト評価の集計更新（旧版互換）
CREATE OR REPLACE FUNCTION update_product_rating(p_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE ideas SET
    rating_ux = (SELECT COALESCE(AVG(ux_score), 0) FROM product_ratings WHERE product_id = p_id),
    rating_design = (SELECT COALESCE(AVG(design_score), 0) FROM product_ratings WHERE product_id = p_id),
    rating_innovation = (SELECT COALESCE(AVG(innovation_score), 0) FROM product_ratings WHERE product_id = p_id),
    rating_count = (SELECT COUNT(*) FROM product_ratings WHERE product_id = p_id)
  WHERE id = p_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 総合評価の平均を更新（rating_avg含む）
CREATE OR REPLACE FUNCTION update_product_rating_avg(p_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE ideas SET
    rating_ux = (SELECT COALESCE(AVG(ux_score), 0) FROM product_ratings WHERE product_id = p_id),
    rating_design = (SELECT COALESCE(AVG(design_score), 0) FROM product_ratings WHERE product_id = p_id),
    rating_innovation = (SELECT COALESCE(AVG(innovation_score), 0) FROM product_ratings WHERE product_id = p_id),
    rating_count = (SELECT COUNT(*) FROM product_ratings WHERE product_id = p_id),
    rating_avg = (
      SELECT COALESCE(
        AVG((ux_score + design_score + innovation_score)::NUMERIC / 3.0),
        0
      )
      FROM product_ratings WHERE product_id = p_id
    )
  WHERE id = p_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- レビューのhelpful数をインクリメント
CREATE OR REPLACE FUNCTION increment_review_helpful(r_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE product_ratings SET helpful_count = COALESCE(helpful_count, 0) + 1 WHERE id = r_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- STEP 5: ランキング用ビュー
-- ============================================

-- 日間ランキング
CREATE OR REPLACE VIEW daily_ranking AS
SELECT i.id, i.name, i.product_url, i.screenshot_url, i.rating_avg, i.rating_count, i.product_clicks,
  COUNT(pr.id) AS daily_ratings,
  COALESCE(AVG((pr.ux_score + pr.design_score + pr.innovation_score)::NUMERIC / 3.0), 0) AS daily_avg
FROM ideas i
LEFT JOIN product_ratings pr ON pr.product_id = i.id AND pr.created_at >= NOW() - INTERVAL '24 hours'
WHERE i.is_product = true
GROUP BY i.id
ORDER BY daily_ratings DESC, daily_avg DESC;

-- 週間ランキング
CREATE OR REPLACE VIEW weekly_ranking AS
SELECT i.id, i.name, i.product_url, i.screenshot_url, i.rating_avg, i.rating_count, i.product_clicks,
  COUNT(pr.id) AS weekly_ratings,
  COALESCE(AVG((pr.ux_score + pr.design_score + pr.innovation_score)::NUMERIC / 3.0), 0) AS weekly_avg
FROM ideas i
LEFT JOIN product_ratings pr ON pr.product_id = i.id AND pr.created_at >= NOW() - INTERVAL '7 days'
WHERE i.is_product = true
GROUP BY i.id
ORDER BY weekly_ratings DESC, weekly_avg DESC;

-- 月間ランキング
CREATE OR REPLACE VIEW monthly_ranking AS
SELECT i.id, i.name, i.product_url, i.screenshot_url, i.rating_avg, i.rating_count, i.product_clicks,
  COUNT(pr.id) AS monthly_ratings,
  COALESCE(AVG((pr.ux_score + pr.design_score + pr.innovation_score)::NUMERIC / 3.0), 0) AS monthly_avg
FROM ideas i
LEFT JOIN product_ratings pr ON pr.product_id = i.id AND pr.created_at >= NOW() - INTERVAL '30 days'
WHERE i.is_product = true
GROUP BY i.id
ORDER BY monthly_ratings DESC, monthly_avg DESC;

-- ============================================
-- STEP 6: votesテーブルにUNIQUE制約（重複投票防止）
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'votes_user_idea_unique'
  ) THEN
    ALTER TABLE votes ADD CONSTRAINT votes_user_idea_unique UNIQUE (user_id, idea_id);
  END IF;
END $$;

-- ============================================
-- STEP 7: Storageバケット
-- ============================================
INSERT INTO storage.buckets (id, name, public) VALUES ('product-screenshots', 'product-screenshots', true) ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read product screenshots' AND tablename = 'objects') THEN
    CREATE POLICY "Public read product screenshots" ON storage.objects FOR SELECT USING (bucket_id = 'product-screenshots');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Auth upload product screenshots' AND tablename = 'objects') THEN
    CREATE POLICY "Auth upload product screenshots" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'product-screenshots' AND auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Owner delete product screenshots' AND tablename = 'objects') THEN
    CREATE POLICY "Owner delete product screenshots" ON storage.objects FOR DELETE USING (bucket_id = 'product-screenshots' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;
END $$;
