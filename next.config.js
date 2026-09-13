/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // 宣言されたContent-Typeを勝手に推測させない
          { key: "X-Content-Type-Options", value: "nosniff" },
          // 外部サイトへ遷移するときにURLのパス・クエリを渡さない
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
