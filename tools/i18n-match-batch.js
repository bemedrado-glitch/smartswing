#!/usr/bin/env node
/**
 * One-shot i18n patcher for the Phase A match-analysis keys (PRs #142,
 * #143, #147). Reads each non-EN locale file, merges the hand-crafted
 * translations below into the existing structure, writes back, and
 * reports coverage.
 *
 * Run:  node tools/i18n-match-batch.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const LOCALES = ['pt-BR', 'es', 'de', 'fr', 'ru', 'zh', 'ja'];
const ROOT = path.resolve(__dirname, '..');

// Hand-crafted translations. Each inner object mirrors the English key
// set in translations/en.json; values should match tone + length closely.
const TRANSLATIONS = {
  'pt-BR': {
    pricingPage: {
      starterSingleSwing: 'Análise de uma tacada (um jogador em cena)',
      starterLockedSave: 'Salvar e exportar laudos — apenas em planos pagos',
      starterLockedLibrary: 'Biblioteca de drills e táticas — apenas em planos pagos',
      starterLockedMatch: 'Análise de partidas — plano Performance',
      playerEverythingInStarter: 'Tudo do Starter, e mais:',
      playerFullTactics: 'Biblioteca completa de táticas com cenários detalhados',
      playerClipExport: 'Exportação de clipes para calibração do técnico',
      playerLockedMatch: 'Análise de vídeos de partidas — plano Performance',
      performanceEverythingInPlayer: 'Tudo do Player, e mais:',
      performanceMatchMode: '★ Modo partida — analise partidas completas ou vídeos do YouTube',
      performanceMultiPlayer: '★ Rastreio de vários jogadores — toque para escolher qual analisar',
      performanceMatchReports: '★ Laudos por ponto com segmentação por tipo de tacada',
      performanceKineticChain: '★ Pontuação da cadeia cinética (ADM + velocidade + timing)',
      performanceRallyTimeline: 'Linha do tempo dos pontos e destaque do rally mais longo',
      performanceMatchHistory: 'Histórico de partidas salvo na sua biblioteca'
    },
    matchReport: {
      title: 'Laudo da partida',
      subtitle: 'Detalhamento ponto a ponto do seu vídeo',
      backLink: '← Voltar para análise',
      saveButton: 'Salvar na biblioteca',
      downloadPdf: 'Baixar PDF',
      shareWithCoach: 'Compartilhar com treinador',
      sectionTimeline: 'Linha do tempo dos pontos',
      sectionShotBreakdown: 'Distribuição de tacadas',
      sectionRallies: 'Rallies',
      statRallies: 'Rallies',
      statAvgRally: 'Rally médio',
      statLongestRally: 'Maior rally',
      statMatchSpan: 'Duração da partida',
      paywallHeading: 'Desbloqueie todos os rallies',
      paywallBody: 'Você está vendo os 3 rallies mais longos como prévia. Atualize para Performance para ver cada tacada — pontuação detalhada da cadeia cinética, avaliação por rally e histórico salvo.',
      paywallCta: 'Atualizar para Performance',
      emptyHeading: 'Nenhum laudo de partida disponível',
      emptyBody: 'Vá para Analisar, ative o modo partida, escolha um jogador e deixe pelo menos 2 rallies rodarem antes de gerar o laudo.'
    }
  },
  'es': {
    pricingPage: {
      starterSingleSwing: 'Análisis de un golpe (un jugador en cuadro)',
      starterLockedSave: 'Guardar y exportar informes — solo en planes de pago',
      starterLockedLibrary: 'Biblioteca de drills y tácticas — solo en planes de pago',
      starterLockedMatch: 'Análisis de partidos — plan Performance',
      playerEverythingInStarter: 'Todo lo de Starter, más:',
      playerFullTactics: 'Biblioteca táctica completa con escenarios detallados',
      playerClipExport: 'Exportación de clips para calibrar con tu entrenador',
      playerLockedMatch: 'Análisis de video de partido — plan Performance',
      performanceEverythingInPlayer: 'Todo lo de Player, más:',
      performanceMatchMode: '★ Modo partido — analiza partidos completos o videos de YouTube',
      performanceMultiPlayer: '★ Seguimiento multijugador — toca para elegir a quién analizar',
      performanceMatchReports: '★ Informes por rally con desglose por tipo de golpe',
      performanceKineticChain: '★ Puntuación de cadena cinética (ROM + velocidad + timing)',
      performanceRallyTimeline: 'Línea de tiempo de rallies y rally más largo destacado',
      performanceMatchHistory: 'Historial de partidos guardado en tu biblioteca'
    },
    matchReport: {
      title: 'Informe de partido',
      subtitle: 'Desglose por rally de tu video',
      backLink: '← Volver al análisis',
      saveButton: 'Guardar en biblioteca',
      downloadPdf: 'Descargar PDF',
      shareWithCoach: 'Compartir con entrenador',
      sectionTimeline: 'Línea de tiempo de rallies',
      sectionShotBreakdown: 'Desglose de golpes',
      sectionRallies: 'Rallies',
      statRallies: 'Rallies',
      statAvgRally: 'Rally promedio',
      statLongestRally: 'Rally más largo',
      statMatchSpan: 'Duración del partido',
      paywallHeading: 'Desbloquea todos los rallies',
      paywallBody: 'Estás viendo los 3 rallies más largos como vista previa. Cambia a Performance para ver todos los golpes — puntuaciones por golpe, calificación por rally e historial guardado.',
      paywallCta: 'Cambiar a Performance',
      emptyHeading: 'No hay informe de partido disponible',
      emptyBody: 'Ve a Analizar, activa el modo partido, elige un jugador y deja que pasen al menos 2 rallies antes de generar el informe.'
    }
  },
  'de': {
    pricingPage: {
      starterSingleSwing: 'Einzel-Schlaganalyse (ein Spieler im Bild)',
      starterLockedSave: 'Speichern & Export — nur in bezahlten Tarifen',
      starterLockedLibrary: 'Drill- & Taktikbibliothek — nur in bezahlten Tarifen',
      starterLockedMatch: 'Matchanalyse — Performance-Tarif',
      playerEverythingInStarter: 'Alles aus Starter, plus:',
      playerFullTactics: 'Vollständige Taktikbibliothek mit Szenario-Analysen',
      playerClipExport: 'Clip-Export zur Kalibrierung mit Trainer',
      playerLockedMatch: 'Match-Videoanalyse — Performance-Tarif',
      performanceEverythingInPlayer: 'Alles aus Player, plus:',
      performanceMatchMode: '★ Match-Modus — analysiere ganze Matches oder YouTube-Videos',
      performanceMultiPlayer: '★ Multi-Spieler-Tracking — tippe den Spieler zum Analysieren',
      performanceMatchReports: '★ Rally-Reports mit Aufschlüsselung nach Schlagart',
      performanceKineticChain: '★ Bewertung der kinetischen Kette (ROM + Geschwindigkeit + Timing)',
      performanceRallyTimeline: 'Rally-Zeitleiste & Highlight des längsten Ballwechsels',
      performanceMatchHistory: 'Match-Verlauf in deiner Bibliothek gespeichert'
    },
    matchReport: {
      title: 'Match-Report',
      subtitle: 'Rally-für-Rally-Auswertung deines Match-Videos',
      backLink: '← Zurück zur Analyse',
      saveButton: 'In Bibliothek speichern',
      downloadPdf: 'PDF herunterladen',
      shareWithCoach: 'Mit Trainer teilen',
      sectionTimeline: 'Rally-Zeitleiste',
      sectionShotBreakdown: 'Schlag-Aufschlüsselung',
      sectionRallies: 'Rallies',
      statRallies: 'Rallies',
      statAvgRally: 'Durchschnittlicher Rally',
      statLongestRally: 'Längster Rally',
      statMatchSpan: 'Matchdauer',
      paywallHeading: 'Alle Rallies freischalten',
      paywallBody: 'Du siehst die 3 längsten Rallies als Vorschau. Upgrade auf Performance, um jeden Schlag zu analysieren — Schlag-für-Schlag-Bewertungen, Rally-Bewertungen und gespeicherter Matchverlauf.',
      paywallCta: 'Auf Performance upgraden',
      emptyHeading: 'Kein Match-Report verfügbar',
      emptyBody: 'Gehe zu Analysieren, aktiviere den Match-Modus, wähle einen Spieler und lasse mindestens 2 Rallies laufen, bevor du einen Report generierst.'
    }
  },
  'fr': {
    pricingPage: {
      starterSingleSwing: "Analyse d'un coup (un joueur dans le cadre)",
      starterLockedSave: 'Enregistrer et exporter — réservé aux plans payants',
      starterLockedLibrary: 'Bibliothèque de drills et tactiques — plans payants uniquement',
      starterLockedMatch: 'Analyse de match — plan Performance',
      playerEverythingInStarter: 'Tout de Starter, plus :',
      playerFullTactics: 'Bibliothèque tactique complète avec scénarios détaillés',
      playerClipExport: 'Export de clips pour calibrage avec votre coach',
      playerLockedMatch: 'Analyse de vidéo de match — plan Performance',
      performanceEverythingInPlayer: 'Tout de Player, plus :',
      performanceMatchMode: '★ Mode match — analyse des matchs entiers ou vidéos YouTube',
      performanceMultiPlayer: '★ Suivi multi-joueurs — touchez le joueur à analyser',
      performanceMatchReports: "★ Rapports par rally avec détail par type de coup",
      performanceKineticChain: '★ Notation chaîne cinétique (ROM + vitesse + timing)',
      performanceRallyTimeline: 'Chronologie des rallies & highlight du plus long',
      performanceMatchHistory: 'Historique de matchs dans votre bibliothèque'
    },
    matchReport: {
      title: 'Rapport de match',
      subtitle: 'Analyse rally par rally de votre vidéo',
      backLink: "← Retour à l'analyse",
      saveButton: 'Enregistrer',
      downloadPdf: 'Télécharger le PDF',
      shareWithCoach: 'Partager avec le coach',
      sectionTimeline: 'Chronologie des rallies',
      sectionShotBreakdown: 'Répartition des coups',
      sectionRallies: 'Rallies',
      statRallies: 'Rallies',
      statAvgRally: 'Rally moyen',
      statLongestRally: 'Plus long rally',
      statMatchSpan: 'Durée du match',
      paywallHeading: 'Débloquez tous les rallies',
      paywallBody: 'Vous voyez les 3 rallies les plus longs en aperçu. Passez à Performance pour détailler chaque coup — notes par coup, évaluation par rally et historique de matchs sauvegardé.',
      paywallCta: 'Passer à Performance',
      emptyHeading: 'Aucun rapport de match disponible',
      emptyBody: "Allez dans Analyser, activez le mode match, choisissez un joueur et laissez passer au moins 2 rallies avant de générer le rapport."
    }
  },
  'ru': {
    pricingPage: {
      starterSingleSwing: 'Анализ одного удара (один игрок в кадре)',
      starterLockedSave: 'Сохранение и экспорт отчётов — только в платных тарифах',
      starterLockedLibrary: 'Библиотека упражнений и тактики — только в платных тарифах',
      starterLockedMatch: 'Анализ матчей — тариф Performance',
      playerEverythingInStarter: 'Всё из Starter, плюс:',
      playerFullTactics: 'Полная тактическая библиотека со сценариями',
      playerClipExport: 'Экспорт клипов для работы с тренером',
      playerLockedMatch: 'Анализ видео матча — тариф Performance',
      performanceEverythingInPlayer: 'Всё из Player, плюс:',
      performanceMatchMode: '★ Режим матча — анализ полных матчей или видео с YouTube',
      performanceMultiPlayer: '★ Отслеживание нескольких игроков — коснитесь, кого анализировать',
      performanceMatchReports: '★ Отчёты по розыгрышам с разбивкой по типу удара',
      performanceKineticChain: '★ Оценка кинетической цепи (ROM + скорость + тайминг)',
      performanceRallyTimeline: 'Шкала розыгрышей и выделение самого длинного',
      performanceMatchHistory: 'История матчей в вашей библиотеке'
    },
    matchReport: {
      title: 'Отчёт о матче',
      subtitle: 'Разбор каждого розыгрыша в вашем видео',
      backLink: '← Назад к анализу',
      saveButton: 'Сохранить в библиотеку',
      downloadPdf: 'Скачать PDF',
      shareWithCoach: 'Поделиться с тренером',
      sectionTimeline: 'Шкала розыгрышей',
      sectionShotBreakdown: 'Распределение ударов',
      sectionRallies: 'Розыгрыши',
      statRallies: 'Розыгрыши',
      statAvgRally: 'Средний розыгрыш',
      statLongestRally: 'Самый длинный',
      statMatchSpan: 'Длительность матча',
      paywallHeading: 'Откройте все розыгрыши',
      paywallBody: 'Вы видите 3 самых длинных розыгрыша в качестве превью. Перейдите на Performance, чтобы анализировать каждый удар — оценки по ударам, оценки по розыгрышам и сохранённая история матчей.',
      paywallCta: 'Перейти на Performance',
      emptyHeading: 'Отчёт о матче недоступен',
      emptyBody: 'Откройте Анализ, включите режим матча, выберите игрока и дайте сыграть минимум 2 розыгрыша перед созданием отчёта.'
    }
  },
  'zh': {
    pricingPage: {
      starterSingleSwing: '单次挥拍分析（画面中一名球员）',
      starterLockedSave: '保存和导出报告 — 仅付费计划',
      starterLockedLibrary: '训练和战术库 — 仅付费计划',
      starterLockedMatch: '比赛分析 — Performance 计划',
      playerEverythingInStarter: '包含 Starter 的所有内容，另加：',
      playerFullTactics: '完整战术库及场景分解',
      playerClipExport: '用于教练校准的视频片段导出',
      playerLockedMatch: '比赛视频分析 — Performance 计划',
      performanceEverythingInPlayer: '包含 Player 的所有内容，另加：',
      performanceMatchMode: '★ 比赛模式 — 分析完整比赛或 YouTube 视频',
      performanceMultiPlayer: '★ 多球员追踪 — 轻点选择要分析的球员',
      performanceMatchReports: '★ 逐回合比赛报告，按击球类型分类',
      performanceKineticChain: '★ 动力链评分（活动范围 + 速度 + 时机）',
      performanceRallyTimeline: '回合时间轴和最长回合亮点',
      performanceMatchHistory: '比赛历史保存到您的库中'
    },
    matchReport: {
      title: '比赛报告',
      subtitle: '视频的逐回合分析',
      backLink: '← 返回分析',
      saveButton: '保存到库',
      downloadPdf: '下载 PDF',
      shareWithCoach: '分享给教练',
      sectionTimeline: '回合时间轴',
      sectionShotBreakdown: '击球分布',
      sectionRallies: '回合',
      statRallies: '回合',
      statAvgRally: '平均回合',
      statLongestRally: '最长回合',
      statMatchSpan: '比赛时长',
      paywallHeading: '解锁每个回合',
      paywallBody: '您正在查看最长的 3 个回合预览。升级到 Performance 查看每一次击球 — 逐球评分、逐回合评级和保存的比赛历史。',
      paywallCta: '升级到 Performance',
      emptyHeading: '无可用比赛报告',
      emptyBody: '前往分析页面，启用比赛模式，选择球员，让至少 2 个回合进行后再生成报告。'
    }
  },
  'ja': {
    pricingPage: {
      starterSingleSwing: '単発スイング分析（画面に1人の選手）',
      starterLockedSave: 'レポートの保存とエクスポート — 有料プランのみ',
      starterLockedLibrary: 'ドリル・戦術ライブラリ — 有料プランのみ',
      starterLockedMatch: 'マッチ分析 — Performance プラン',
      playerEverythingInStarter: 'Starter の全機能に加えて：',
      playerFullTactics: 'シナリオ別の完全な戦術ライブラリ',
      playerClipExport: 'コーチとの調整に使えるクリップのエクスポート',
      playerLockedMatch: 'マッチ動画分析 — Performance プラン',
      performanceEverythingInPlayer: 'Player の全機能に加えて：',
      performanceMatchMode: '★ マッチモード — フルマッチや YouTube 動画を分析',
      performanceMultiPlayer: '★ マルチプレイヤー追跡 — 分析する選手をタップで選択',
      performanceMatchReports: '★ ラリーごとのレポート、ショット種別の内訳付き',
      performanceKineticChain: '★ キネティックチェーンのスコア（ROM + 速度 + タイミング）',
      performanceRallyTimeline: 'ラリータイムラインと最長ラリーのハイライト',
      performanceMatchHistory: 'マッチ履歴をライブラリに保存'
    },
    matchReport: {
      title: 'マッチレポート',
      subtitle: 'マッチ動画のラリーごとの内訳',
      backLink: '← 分析に戻る',
      saveButton: 'ライブラリに保存',
      downloadPdf: 'PDF をダウンロード',
      shareWithCoach: 'コーチと共有',
      sectionTimeline: 'ラリータイムライン',
      sectionShotBreakdown: 'ショットの内訳',
      sectionRallies: 'ラリー',
      statRallies: 'ラリー',
      statAvgRally: '平均ラリー',
      statLongestRally: '最長ラリー',
      statMatchSpan: 'マッチ時間',
      paywallHeading: 'すべてのラリーをロック解除',
      paywallBody: '最長3つのラリーをプレビューで表示しています。Performance にアップグレードして、すべてのショットを掘り下げましょう — ショット別スコア、ラリー別評価、保存されたマッチ履歴。',
      paywallCta: 'Performance にアップグレード',
      emptyHeading: 'マッチレポートが利用できません',
      emptyBody: '「分析」でマッチモードをオンにし、選手を選び、2ラリー以上プレイされてからレポートを生成してください。'
    }
  }
};

// Deep-merge: only adds keys that don't exist in the target locale; never
// overwrites an existing translation (safe to re-run).
function deepMerge(target, source) {
  for (const k of Object.keys(source)) {
    if (
      typeof source[k] === 'object' &&
      source[k] !== null &&
      !Array.isArray(source[k])
    ) {
      if (!target[k] || typeof target[k] !== 'object') target[k] = {};
      deepMerge(target[k], source[k]);
    } else {
      if (!(k in target)) target[k] = source[k];
    }
  }
  return target;
}

// Apply.
let totalAdded = 0;
for (const locale of LOCALES) {
  const file = path.join(ROOT, 'translations', `${locale}.json`);
  const before = JSON.parse(fs.readFileSync(file, 'utf8'));
  const beforeSize = JSON.stringify(before).length;
  deepMerge(before, TRANSLATIONS[locale]);
  const afterSize = JSON.stringify(before).length;
  fs.writeFileSync(file, JSON.stringify(before, null, 2) + '\n', 'utf8');
  const added = afterSize - beforeSize;
  totalAdded += added;
  console.log(`${locale}: +${added} bytes added`);
}
console.log(`\nDone. Total: ${totalAdded} bytes across ${LOCALES.length} locales.`);
