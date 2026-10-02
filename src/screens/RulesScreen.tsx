import type { ReactNode } from 'react';
import { PieceSvg } from '../components/board/PieceSvg';
import { useAppStore } from '../state/appStore';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel flex flex-col gap-2 p-5">
      <h2 className="text-lg font-bold text-gold-300">{title}</h2>
      <div className="flex flex-col gap-2 text-sm leading-relaxed text-ink-200">{children}</div>
    </section>
  );
}

export function RulesScreen() {
  const go = useAppStore((s) => s.go);
  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col gap-4 p-4 py-8">
      <div className="flex items-center gap-3">
        <button type="button" className="btn btn-ghost px-2 text-xs" onClick={() => go('title')}>
          ← 메뉴
        </button>
        <h1 className="font-serif-kr text-3xl font-bold text-gold-300">게임 규칙</h1>
      </div>

      <Section title="기본은 정통 체스">
        <p>기물의 행마, 캐슬링, 앙파상, 승진은 일반 체스와 같습니다. 백이 먼저 두고, 한 턴에는 언제나 한 수만 둡니다.</p>
        <p>
          단, <b className="text-ink-100">체크메이트 대신 상대 킹을 잡으면 승리</b>합니다. 증강 때문에 체크를 일일이 따지기 어려우므로, 킹을 공격받게 두는 수도 둘 수 있습니다. 그 대신 상대가 바로 킹을
          잡아 버립니다. 킹을 내주는 수는 보드에 빨간 점으로 표시됩니다(설정에서 끌 수 있습니다).
        </p>
        <p>
          둘 수 있는 수가 하나도 없으면 그쪽이 집니다. 50수 동안 잡기와 폰 이동이 없거나, 같은 국면이 세 번 나오거나, 양쪽 모두 킹만 남으면 무승부입니다.
        </p>
      </Section>

      <Section title="증강 선택">
        <p>
          <b className="text-ink-100">게임 시작, 10수째, 20수째</b>에 양쪽이 각자 증강 카드 세 장 중 한 장을 고릅니다. 같은 라운드에서는 양쪽 모두 같은 등급(실버·골드·프리즘)의 카드를 받고,
          라운드가 진행될수록 높은 등급이 잘 나옵니다.
        </p>
        <p>마음에 드는 카드가 없으면 게임당 한 번 새로고침할 수 있습니다. 고른 증강은 양쪽 모두에게 공개됩니다.</p>
      </Section>

      <Section title="패시브와 액티브">
        <p>
          <b className="text-ink-100">패시브</b> 카드는 고르는 순간부터 효과가 적용됩니다. 기물의 행마를 늘리거나, 폰의 규칙을 바꾸거나, 새로운 승리 조건을 줍니다.
        </p>
        <p>
          <b className="text-arcane-300">액티브</b> 카드는 자기 턴에 수를 두기 전에 사용합니다. 사용해도 턴이 넘어가지 않으며, 한 턴에 한 장까지 쓸 수 있습니다. 카드는 기물을 움직이지 않고, 소환하거나
          되살린 기물은 그 턴에는 움직일 수 없습니다.
        </p>
      </Section>

      <Section title="특수 기물과 효과">
        <div className="flex items-center gap-3">
          <PieceSvg type="archbishop" side="white" className="h-12 w-12 shrink-0" />
          <p>
            <b className="text-ink-100">대주교</b>: 비숍처럼 움직이고, 나이트처럼 도약할 수도 있습니다.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <PieceSvg type="chancellor" side="white" className="h-12 w-12 shrink-0" />
          <p>
            <b className="text-ink-100">재상</b>: 룩처럼 움직이고, 나이트처럼 도약할 수도 있습니다.
          </p>
        </div>
        <p>
          <b className="text-arcane-300">보호막</b>: 기물이 제거될 때 한 번 대신 깨집니다. 보호막 기물을 잡으려던 기물은 제자리로 돌아갑니다.
        </p>
        <p>
          <b className="text-sky-200">동결</b>: 얼어붙은 기물은 주인의 다음 턴 동안 움직이거나 잡을 수 없습니다.
        </p>
        <p>
          <b className="text-ink-100">바리케이드</b>: 모든 기물의 길을 막습니다. 잡듯이 들어가면 부수고 그 칸으로 이동합니다.
        </p>
        <p>
          <b className="text-blood-300">함정</b>: 상대 기물이 함정 칸에 들어오면 제거됩니다. 킹이 들어오면 함정만 사라집니다.
        </p>
        <p>
          <b className="text-gold-300">기물 위의 금색 마름모</b>는 증강으로 행마가 늘어난 기물입니다. 칸에 마우스를 올리면 자세한 효과가 보입니다.
        </p>
      </Section>

      <Section title="AI 난이도">
        <p>입문·초급·중급은 정해진 깊이까지 읽고 일부러 실수를 섞습니다. 고급과 마스터는 제한 시간 동안 최대한 깊이 읽는 알파-베타 탐색 엔진으로, 증강 규칙을 모두 이해하고 둡니다.</p>
      </Section>
    </div>
  );
}
