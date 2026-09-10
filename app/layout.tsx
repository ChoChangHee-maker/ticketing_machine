import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'ONSTAGE | 다음의 설렘을, 예매하세요',
  description: '공연 탐색부터 좌석 선택까지. 당신의 다음 이야기가 시작되는 곳, ONSTAGE. 체험용 티켓 예매 서비스입니다.',
  openGraph: { title: 'ONSTAGE | 다음의 설렘을, 예매하세요', description: '공연 탐색부터 좌석 선택까지. 당신의 다음 이야기가 시작되는 곳.' },
  twitter: { card: 'summary_large_image', title: 'ONSTAGE | 다음의 설렘을, 예매하세요', description: '당신의 다음 이야기가 시작되는 곳.' },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
