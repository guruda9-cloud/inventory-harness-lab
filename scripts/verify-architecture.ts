/**
 * 아키텍처 규칙 정적 검사 — docs/06-architecture.md가 정한 "정해진 통로"를
 * 코드가 실제로 우회하지 않는지 확인한다. DB 연결 없이 소스만 읽는다.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = join(__dirname, '..')
const SKIP_DIRS = new Set(['node_modules', '.next', 'generated', '.git'])

function collectFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) collectFiles(full, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(full)
  }
  return out
}

const files = collectFiles(join(ROOT, 'src'))
let violations = 0

// 규칙 1 (06-architecture.md §2/§4.1)
// "재고 수량을 바꾸는 코드는 lib/stock.ts의 applyMovement() 한 곳에만 존재한다.
//  화면·액션은 이 함수를 부를 뿐, prisma.lot.update()를 직접 호출하지 않는다."
const STOCK_TS = join(ROOT, 'src', 'lib', 'stock.ts')
const LOT_WRITE = /\.lot\.(update|upsert|create)(Many)?\s*\(/

let gatewayHits = 0
for (const file of files) {
  if (file === STOCK_TS) continue
  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, i) => {
    if (LOT_WRITE.test(line)) {
      gatewayHits++
      console.log(
        `❌ [재고 변경 통로 위반] ${relative(ROOT, file)}:${i + 1} — lot을 직접 변경하지 말고 applyMovement()(src/lib/stock.ts)를 통해야 합니다`
      )
      console.log(`     ${line.trim()}`)
    }
  })
}
if (gatewayHits === 0) {
  console.log('✅ 재고 변경은 전부 applyMovement() 한 곳(src/lib/stock.ts)을 통과합니다')
}
violations += gatewayHits

// 규칙 2 (06-architecture.md §7.5)
// "React 컴포넌트가 Prisma를 직접 호출하는 구조가 아니라, 서버 영역에서만 Prisma를 사용한다."
const PRISMA_IMPORT = /from\s+['"](@\/lib\/db|@\/generated\/prisma\/client|@prisma\/client)['"]/

let boundaryHits = 0
for (const file of files) {
  const text = readFileSync(file, 'utf8')
  if (!/^\s*['"]use client['"]/m.test(text)) continue
  if (PRISMA_IMPORT.test(text)) {
    boundaryHits++
    console.log(
      `❌ [서버 전용 경계 위반] ${relative(ROOT, file)} — 클라이언트 컴포넌트('use client')가 Prisma를 직접 import 합니다`
    )
  }
}
if (boundaryHits === 0) {
  console.log('✅ 클라이언트 컴포넌트는 Prisma를 직접 쓰지 않습니다 (서버 전용 경계 유지)')
}
violations += boundaryHits

if (violations > 0) {
  console.log(`\n아키텍처 위반 ${violations}건 — docs/06-architecture.md 참고`)
  process.exit(1)
}
console.log('\n아키텍처 검증 통과')
