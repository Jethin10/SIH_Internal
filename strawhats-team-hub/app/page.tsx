'use client';

import { useMemo, useState } from 'react';
import { Blocks, BookOpenCheck, Check, ChevronRight, Gauge, Rocket, ScanSearch, ServerCog, ShieldCheck, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

const members = ['All', 'Jethin', 'Ishu', 'Divyam', 'Shubhangi', 'Maan', 'Shreya'] as const;

const areas = [
  {
    id: 'browser', number: '01', title: 'Browser extension', eyebrow: 'Frontend and page understanding', icon: Blocks,
    people: ['Jethin', 'Divyam', 'Ishu'],
    objective: 'Understand how the extension observes a live page, maintains safe state and presents decisions to the user.',
    learn: ['Chrome Manifest V3 structure, permissions and lifecycle', 'Content scripts, service workers and message passing', 'DOM, forms, ARIA roles, open Shadow DOM and permitted iframes', 'MutationObserver, element IDs, hashes and version tracking', 'Chrome side panel UI, accessibility and action feedback', 'Restricted pages, closed shadow roots and browser PDF limitations'],
    build: ['Verify page inspection on static and dynamic websites', 'Prepare a stable local demo page with forms, PII and canvas content', 'Polish the raw-local, safe-context and confirmation views', 'Write installation steps and a browser troubleshooting checklist'],
    prove: ['A changed field updates only the affected graph nodes', 'Sensitive values never appear in the safe-context panel', 'The extension fails safely on inaccessible browser surfaces'],
    questions: ['Why use DOM and ARIA before OCR?', 'How do you handle dynamic pages?', 'Why does the extension request access to all URLs?', 'What browser content can the extension not inspect?'],
  },
  {
    id: 'backend', number: '02', title: 'Backend and agent', eyebrow: 'Cloud reasoning and structured actions', icon: ServerCog,
    people: ['Jethin', 'Maan', 'Shreya'],
    objective: 'Own the path from sanitized browser context to a valid model action and back to the browser.',
    learn: ['Client-server architecture, HTTPS requests and REST conventions', 'OpenAI-compatible chat completion request and response formats', 'System prompts for constrained browser planning', 'Structured action schemas for click, fill, select, press and scroll', 'JSON parsing, validation, timeouts, rate limits and retry policy', 'Difference between the local mock provider and a real hosted model'],
    build: ['Create a minimal server endpoint for sanitized agent requests', 'Connect one real model and record a complete successful task', 'Reject malformed responses, unknown actions and invented targets', 'Measure network, model and full task latency separately'],
    prove: ['The server receives aliases instead of raw private values', 'An invalid model response cannot reach browser execution', 'A real model completes one reproducible browser task'],
    questions: ['Why do you need a server if the extension can call an API?', 'What exactly reaches the cloud?', 'Can the model execute arbitrary JavaScript?', 'What happens when the provider times out?'],
  },
  {
    id: 'privacy', number: '03', title: 'Privacy and vision', eyebrow: 'PII detection, OCR and redaction', icon: ScanSearch,
    people: ['Divyam', 'Shubhangi', 'Maan'],
    objective: 'Know how private information is detected locally, transformed safely and handled when it appears inside visual content.',
    learn: ['Indian PII formats including Aadhaar, PAN, UPI, IFSC and phone numbers', 'Regular expressions, Aadhaar checksums and payment-card Luhn checks', 'Tokenization, masking, dropping, blocking and task-scoped aliases', 'Precision, recall, false positives and false negatives', 'Tesseract OCR, WebAssembly and bounding-box redaction', 'ViT, ONNX Runtime Web, WebGPU and multilingual model options', 'Faces, scanned documents, screenshots and non-text privacy risks'],
    build: ['Create realistic Indian PII and non-PII test samples', 'Add mixed Hindi-English text and OCR-error cases', 'Demonstrate visible redaction boxes before any network request', 'Compare structured tokenization with screenshot masking'],
    prove: ['Raw values stay in the local vault while aliases remain useful', 'PII in canvas text is detected without uploading the screenshot', 'Accuracy claims use a dataset separate from recognizer development'],
    questions: ['Is your PII detector 100% accurate?', 'How do aliases preserve task utility?', 'Does OCR count as a vision model?', 'How will you detect faces and multilingual PII?'],
  },
  {
    id: 'security', number: '04', title: 'Security firewall', eyebrow: 'Local control and threat defence', icon: ShieldCheck,
    people: ['Jethin', 'Shubhangi', 'Shreya'],
    objective: 'Understand every boundary that prevents a malicious page or model from turning a valid task into unsafe execution.',
    learn: ['Prompt injection, data exfiltration and confused-deputy attacks', 'Origin policy, task scope and semantic destination checks', 'Element-version validation and stale-target protection', 'Capability expiry, action limits and cross-origin replay defence', 'Final egress inspection before provider requests', 'High-risk confirmation and session-only secret storage'],
    build: ['Revalidate domain policy after every navigation and agent step', 'Test actions outside the user request and cross-origin token replay', 'Prepare a visible blocked-action demonstration', 'Write a one-page threat model with assets, attackers and mitigations'],
    prove: ['Known raw PII cannot pass the final outbound inspection', 'A stale or wrong-origin action is blocked locally', 'A risky action pauses for explicit user confirmation'],
    questions: ['Can a malicious model misuse an alias?', 'How do you defend against prompt injection?', 'What happens after cross-origin navigation?', 'Is this a production-grade security boundary?'],
  },
  {
    id: 'testing', number: '05', title: 'Testing and metrics', eyebrow: 'Evidence for the five SIH criteria', icon: Gauge,
    people: ['Ishu', 'Shubhangi', 'Shreya'],
    objective: 'Turn product claims into repeatable evidence aligned with the exact SIH26171 scoring criteria.',
    learn: ['Visual-context accuracy and task-success evaluation', 'PII precision, recall, F1 and confusion matrices', 'Redaction precision, over-redaction and retained utility', 'CPU, memory and GPU measurement in the browser', 'Cold-start, warm p50, p95, p99, OCR and end-to-end latency', 'Unit, integration, adversarial and clean-profile browser testing', 'Synthetic regression data versus representative real-world data'],
    build: ['Fix the combined npm evaluation command', 'Create a held-out PII and visual-redaction benchmark set', 'Record CPU and memory use on at least two machines', 'Produce one judge-ready results table with method and limitations'],
    prove: ['Every metric can be reproduced with one documented command', 'The warm structured path and OCR are reported separately', 'Synthetic scores are clearly labelled and never presented as field accuracy'],
    questions: ['What dataset did you use?', 'What does your 12 ms result include?', 'How much memory does the extension consume?', 'How do you measure redaction without hiding useful content?'],
  },
  {
    id: 'research', number: '06', title: 'Research and presentation', eyebrow: 'Accurate product story for judges', icon: BookOpenCheck,
    people: ['Jethin', 'Ishu', 'Divyam'],
    objective: 'Explain the real product clearly, compare it fairly and keep every slide claim tied to working evidence.',
    learn: ['Complete SIH26171 statement and its weighted evaluation criteria', 'Stagehand, Agent-E, Skyvern, OmniParser and UI-TARS', 'Browser privacy, local inference and prior redaction approaches', 'Current implementation versus planned architecture', 'Technical citation, comparison-table and benchmark-writing standards', 'Short demo storytelling and judge-question handling'],
    build: ['Correct the theme, Team ID and generic slide titles', 'Remove unsupported React, ONNX, database and deployment claims', 'Add real extension screenshots and measured results', 'Prepare speaking notes, transitions and a shared question bank'],
    prove: ['Every technology named in the deck exists in the product or is labelled future work', 'Every number includes its benchmark scope', 'Every team member can explain the full local-to-cloud flow'],
    questions: ['What is genuinely novel here?', 'How is this different from existing browser agents?', 'Which capabilities work today?', 'What will you build next and why?'],
  },
  {
    id: 'release', number: '07', title: 'Release and demo', eyebrow: 'Deployment, packaging and presentation safety', icon: Rocket,
    people: ['Divyam', 'Maan', 'Shreya'],
    objective: 'Make the exact product shown to judges installable, repeatable and resilient to common presentation failures.',
    learn: ['Loading and debugging unpacked Chrome extensions', 'Release versioning, ZIP contents and SHA-256 checksums', 'CI pipelines, deployment logs and rollback basics', 'API-key handling and environment configuration', 'Clean demo profiles, deterministic test data and offline fallback', 'Backup recordings and failure-recovery scripts'],
    build: ['Regenerate and verify the current version 1.0.0 release ZIP', 'Install the ZIP on a second computer and run the full demo', 'Deploy the minimal server and document its configuration', 'Rehearse five times and record one clean backup video'],
    prove: ['A fresh machine can install and run the product from the submitted package', 'The demo works with a clean browser profile', 'The team has a tested recovery plan for network or model failure'],
    questions: ['How can we install your prototype?', 'Where is the server deployed?', 'What happens if the internet fails?', 'How are API keys protected?'],
  },
];

type Member = (typeof members)[number];

export default function Home() {
  const [member, setMember] = useState<Member>('All');
  const visibleAreas = useMemo(() => member === 'All' ? areas : areas.filter((area) => area.people.includes(member)), [member]);

  return (
    <main className="min-h-screen overflow-hidden">
      <div className="site-glow site-glow-one" aria-hidden="true" />
      <div className="site-glow site-glow-two" aria-hidden="true" />
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#07110f]/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8 lg:px-10">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-full border border-[#ff9d2e]/40 bg-[#ff9d2e]/10 text-sm font-semibold text-[#ffb65f]">S</div>
            <div><p className="text-sm font-semibold tracking-tight text-white">StrawHats</p><p className="text-xs text-white/45">SIH26171 · Team knowledge map</p></div>
          </div>
          <div className="hidden items-center gap-2 text-xs text-white/55 sm:flex"><Users className="size-4 text-[#46d99b]" />6 members · 7 areas · 3 people each</div>
        </div>
      </header>

      <section className="relative mx-auto max-w-7xl px-5 pb-12 pt-14 sm:px-8 sm:pt-20 lg:px-10 lg:pt-24">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
          <div>
            <div className="mb-6 flex items-center gap-3 text-xs font-medium uppercase tracking-[0.22em] text-[#46d99b]"><span className="h-px w-10 bg-[#46d99b]" />Internal preparation system</div>
            <h1 className="max-w-4xl text-balance text-5xl font-medium leading-[0.98] tracking-[-0.055em] text-white sm:text-6xl lg:text-7xl">Team responsibility and learning map</h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-white/60">Every area has three assigned members. Each person must understand the theory, contribute to the product, verify the evidence and answer judges without guessing.</p>
          </div>
          <div className="border-l border-white/10 pl-6">
            <p className="text-xs uppercase tracking-[0.18em] text-white/40">Shared completion rule</p>
            <ol className="mt-5 space-y-3 text-sm text-white/75">
              {['Research the topic', 'Build or verify the feature', 'Test and record evidence', 'Teach the rest of the team'].map((step, index) => <li key={step} className="flex items-center gap-3"><span className="grid size-6 place-items-center rounded-full border border-white/15 font-mono text-[11px] text-[#ffb65f]">{index + 1}</span>{step}</li>)}
            </ol>
          </div>
        </div>
        <div className="mt-14 border-y border-white/10 py-5">
          <p className="mb-3 text-xs uppercase tracking-[0.16em] text-white/40">Filter by member</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter work areas by member">
            {members.map((name) => <Button key={name} type="button" variant={member === name ? 'default' : 'outline'} size="lg" aria-pressed={member === name} onClick={() => setMember(name)} className={member === name ? 'rounded-full bg-[#f7f4ed] px-5 text-[#07110f] hover:bg-white' : 'rounded-full border-white/10 bg-transparent px-5 text-white/60 hover:border-white/25 hover:bg-white/5 hover:text-white'}>{name}</Button>)}
          </div>
        </div>
      </section>

      <section className="relative mx-auto max-w-7xl px-5 pb-24 sm:px-8 lg:px-10">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div><p className="text-xs uppercase tracking-[0.18em] text-white/40">Knowledge domains</p><h2 className="mt-2 text-2xl font-medium tracking-tight text-white">{member === 'All' ? 'Complete team coverage' : `${member}'s assigned areas`}</h2></div>
          <p className="font-mono text-sm text-white/40">{String(visibleAreas.length).padStart(2, '0')} / 07</p>
        </div>
        <Accordion multiple defaultValue={['browser']} className="border-t border-white/10">
          {visibleAreas.map((area) => {
            const Icon = area.icon;
            return <AccordionItem key={area.id} value={area.id} className="border-white/10">
              <AccordionTrigger className="group rounded-none px-0 py-7 hover:no-underline sm:py-8">
                <div className="grid w-full grid-cols-[54px_minmax(0,1fr)] gap-4 pr-5 sm:grid-cols-[72px_minmax(230px,0.9fr)_minmax(300px,1.2fr)] sm:items-center sm:gap-6">
                  <span className="font-mono text-sm text-[#ffb65f]">{area.number}</span>
                  <div className="flex items-start gap-4 text-left"><span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.035] text-[#46d99b] transition-colors group-hover:border-[#46d99b]/30"><Icon className="size-4" /></span><div><h3 className="text-lg font-medium tracking-tight text-white sm:text-xl">{area.title}</h3><p className="mt-1 text-sm font-normal text-white/45">{area.eyebrow}</p></div></div>
                  <div className="col-start-2 mt-3 flex flex-wrap gap-2 sm:col-start-3 sm:mt-0 sm:justify-end">{area.people.map((person) => <span key={person} className="rounded-full border border-white/10 px-3 py-1 text-xs font-normal text-white/60">{person}</span>)}</div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-10 pl-[70px] pr-0 sm:pl-[102px]">
                <p className="max-w-3xl text-base leading-7 text-white/65">{area.objective}</p>
                <div className="mt-8 grid gap-8 lg:grid-cols-2 lg:gap-x-14"><KnowledgeBlock label="Learn completely" items={area.learn} accent="green" /><KnowledgeBlock label="Build and practise" items={area.build} accent="orange" /><KnowledgeBlock label="Evidence to produce" items={area.prove} accent="green" /><KnowledgeBlock label="Questions judges may ask" items={area.questions} accent="orange" /></div>
              </AccordionContent>
            </AccordionItem>;
          })}
        </Accordion>
        <div className="mt-16 grid gap-8 border-t border-white/10 pt-10 md:grid-cols-[1fr_1.4fr]">
          <div><p className="text-xs uppercase tracking-[0.18em] text-[#46d99b]">Definition of ready</p><h2 className="mt-3 max-w-sm text-3xl font-medium leading-tight tracking-[-0.035em] text-white">No one finishes with private knowledge</h2></div>
          <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
            {['All three members can explain the area independently', 'At least one working product example is prepared', 'Claims are supported by a test, measurement or source', 'Limitations and next steps are stated honestly'].map((item) => <div key={item} className="flex gap-3 border-b border-white/10 pb-4 text-sm leading-6 text-white/65"><Check className="mt-1 size-4 shrink-0 text-[#ffb65f]" />{item}</div>)}
          </div>
        </div>
      </section>
      <footer className="border-t border-white/10"><div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-7 text-xs text-white/35 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10"><p>StrawHats · SIH26171 · On-device Visual Perception for Light-weight Browser Agents</p><p className="flex items-center gap-2">Study deeply <ChevronRight className="size-3" /> Build honestly <ChevronRight className="size-3" /> Present clearly</p></div></footer>
    </main>
  );
}

function KnowledgeBlock({ label, items, accent }: { label: string; items: string[]; accent: 'green' | 'orange' }) {
  return <section><div className="mb-4 flex items-center gap-3"><span className={`size-1.5 rounded-full ${accent === 'green' ? 'bg-[#46d99b]' : 'bg-[#ff9d2e]'}`} /><h4 className="text-xs font-medium uppercase tracking-[0.16em] text-white/45">{label}</h4></div><ul className="space-y-3">{items.map((item) => <li key={item} className="flex gap-3 text-sm leading-6 text-white/70"><span className="mt-[10px] h-px w-3 shrink-0 bg-white/20" />{item}</li>)}</ul></section>;
}
