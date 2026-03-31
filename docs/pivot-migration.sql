-- ============================================
-- あいぽ 大型ピボット: 個人開発ショーケース化
-- マイグレーションSQL
-- ============================================
-- 既存のproduct-feature.sqlで追加済みのカラム・テーブルを前提に
-- 追加で必要な変更のみ記載

-- 1. product_ratingsテーブルにreviewカラムを追加（レビューコメント機能）
ALTER TABLE product_ratings ADD COLUMN IF NOT EXISTS review_text TEXT;
ALTER TABLE product_ratings ADD COLUMN IF NOT EXISTS helpful_count INTEGER DEFAULT 0;

-- 2. ideasテーブルに追加カラム
-- プロダクト投稿のデフォルトスクリーンショット複数対応
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS screenshots TEXT[] DEFAULT '{}';
-- 技術スタックをタグ配列で保持（既にtech_stackがあるが念のため）
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS tech_stack TEXT[] DEFAULT '{}';
-- 総合評価スコア（5段階の平均）
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS rating_avg NUMERIC(3,2) DEFAULT 0;
-- プロダクトのステータス
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS product_status TEXT DEFAULT 'active' CHECK (product_status IN ('active', 'beta', 'launched', 'discontinued'));

-- 3. レビューのhelpful投票テーブル
CREATE TABLE IF NOT EXISTS review_helpful (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  rating_id UUID REFERENCES product_ratings(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(rating_id, user_id)
);

ALTER TABLE review_helpful ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read helpful" ON review_helpful FOR SELECT USING (true);
CREATE POLICY "Auth users can insert helpful" ON review_helpful FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 4. RPC関数: 総合評価の平均を更新
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

-- 5. RPC関数: レビューのhelpful数をインクリメント
CREATE OR REPLACE FUNCTION increment_review_helpful(r_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE product_ratings SET helpful_count = COALESCE(helpful_count, 0) + 1 WHERE id = r_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. ランキング用ビュー（日間・週間・月間）
-- 日間ランキング: 過去24時間の評価数と平均スコアでソート
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

-- 7. votesテーブルにUNIQUE制約を追加（重複投票防止）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'votes_user_idea_unique'
  ) THEN
    ALTER TABLE votes ADD CONSTRAINT votes_user_idea_unique UNIQUE (user_id, idea_id);
  END IF;
END $$;

-- 8. Storageバケット: プロダクトスクリーンショット用
-- Supabase管理画面で作成するか、以下SQLで作成
INSERT INTO storage.buckets (id, name, public) VALUES ('product-screenshots', 'product-screenshots', true) ON CONFLICT (id) DO NOTHING;

-- ストレージポリシー
CREATE POLICY "Public read product screenshots" ON storage.objects FOR SELECT USING (bucket_id = 'product-screenshots');
CREATE POLICY "Auth upload product screenshots" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'product-screenshots' AND auth.role() = 'authenticated');
CREATE POLICY "Owner delete product screenshots" ON storage.objects FOR DELETE USING (bucket_id = 'product-screenshots' AND auth.uid()::text = (storage.foldername(name))[1]);
