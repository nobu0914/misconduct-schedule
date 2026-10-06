export default function DisclaimerPage() {
  return (
    <div className="min-h-screen bg-gray-950">
      <div className="max-w-xl mx-auto px-4 py-10 space-y-8">
        <div>
          <h2 className="text-xl font-bold text-white mb-1">免責事項</h2>
          <p className="text-xs text-gray-500">最終更新：2026年3月31日</p>
        </div>

        <section className="space-y-3 text-sm text-gray-300 leading-relaxed">
          <h3 className="text-base font-semibold text-white">本サービスについて</h3>
          <p>
            本サービス（MHL / CXC API）は、Misconduct Inline Hockey League（MHL）およびCxC（ミスク）の公式サイトの情報を自動取得・表示する非公式ツールです。MHL、CxCおよびその関係団体とは一切関係がありません。
          </p>
        </section>

        <section className="space-y-3 text-sm text-gray-300 leading-relaxed">
          <h3 className="text-base font-semibold text-white">情報の正確性について</h3>
          <p>
            本サービスが表示する情報は、公式サイトから自動取得したものですが、取得タイミングや処理上の都合により、実際の情報と異なる場合があります。スケジュール・レンタル情報・イベント情報等については、必ず公式サイトをご確認ください。
          </p>
          <p>
            本サービスに掲載された情報の正確性・完全性・最新性について、運営者は一切の保証を行いません。
          </p>
        </section>

        <section className="space-y-3 text-sm text-gray-300 leading-relaxed">
          <h3 className="text-base font-semibold text-white">損害について</h3>
          <p>
            本サービスの利用または利用不能によって生じた直接的・間接的な損害について、運営者は一切の責任を負いません。本サービスのご利用は自己責任にてお願いいたします。
          </p>
        </section>

        <section className="space-y-3 text-sm text-gray-300 leading-relaxed">
          <h3 className="text-base font-semibold text-white">著作権について</h3>
          <p>
            本サービスが表示するデータの著作権は、各公式サイトの運営者に帰属します。本サービスは情報の閲覧利便性向上を目的としており、商業目的での利用は行っておりません。
          </p>
        </section>

        <section className="space-y-3 text-sm text-gray-300 leading-relaxed">
          <h3 className="text-base font-semibold text-white">サービスの変更・停止</h3>
          <p>
            運営者は、事前の通知なく本サービスの内容を変更または停止する場合があります。これによって生じた損害について、運営者は責任を負いません。
          </p>
        </section>

        <section className="space-y-3 text-sm text-gray-300 leading-relaxed">
          <h3 className="text-base font-semibold text-white">お問い合わせ</h3>
          <p>
            本サービスに関するご意見・ご要望は<a href="/contact" className="text-blue-400 underline">お問い合わせページ</a>よりご連絡ください。
          </p>
        </section>
      </div>
    </div>
  );
}
