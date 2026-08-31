import { defineConfig } from 'vitest/config'

export default defineConfig(({ command }) => ({
  /**
   * GitHub Pages 프로젝트 페이지는 `https://<user>.github.io/<repo>/` 아래에 놓이므로
   * 자산 경로에 접두사가 필요하다.
   *
   * **빌드에만** 붙인다. dev 서버까지 `/random-td/` 로 옮기면 터널·LAN 주소를 루트로 열었을 때
   * 빈 화면이 나온다 — 폰 확인이 주 사용처라 그게 더 손해다.
   */
  base: command === 'build' ? '/random-td/' : '/',
  server: {
    port: 5173,
    /**
     * Vite 6 은 모르는 Host 헤더를 403 으로 막는다(DNS 리바인딩 방어).
     * 폰에서 원격으로 테스트할 때 쓰는 cloudflare 임시 터널만 열어준다 —
     * `true` 로 전부 열면 그 방어가 무의미해진다.
     */
    allowedHosts: ['.trycloudflare.com'],
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
}))
