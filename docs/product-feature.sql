-- ============================================
-- プロダクト投稿機能 - DBスキーマ変更
-- ============================================

-- 1. ideasテーブルにプロダクト関連カラムを追加
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

-- 2. product_ratingsテーブルを新規作成
CREATE TABLE product_ratings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID REFERENCES ideas(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ux_score INTEGER CHECK (ux_score BETWEEN 1 AND 5),
  design_score INTEGER CHECK (design_score BETWEEN 1 AND 5),
  innovation_score INTEGER CHECK (innovation_score BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(product_id, user_id)
);

-- RLS
ALTER TABLE product_ratings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read ratings" ON product_ratings FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert" ON product_ratings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own" ON product_ratings FOR UPDATE USING (auth.uid() = user_id);

-- 3. RPC関数: プロダクトクリック数のインクリメント
CREATE OR REPLACE FUNCTION increment_product_clicks(p_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE ideas SET product_clicks = COALESCE(product_clicks, 0) + 1 WHERE id = p_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. RPC関数: プロダクト評価の集計更新
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
