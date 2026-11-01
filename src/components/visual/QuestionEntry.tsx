import { Link } from 'react-router-dom';
import { Building2, ChevronRight, HeartPulse, MapPinned, Scale } from 'lucide-react';

const QUESTIONS = [
  {
    to: '/explore?focus=town',
    icon: MapPinned,
    label: "What's being built in my town?",
    hint: 'Pick a municipality on the map or from the list',
  },
  {
    to: '/explore?focus=changed',
    icon: Scale,
    label: 'What changed from last year?',
    hint: 'District offices compared with recent enacted budgets',
  },
  {
    to: '/explore?focus=health',
    icon: HeartPulse,
    label: 'Which health projects are funded?',
    hint: 'Health facilities program only',
  },
  {
    to: '/explore?focus=house',
    icon: Building2,
    label: 'What did Congress add?',
    hint: 'Lines that appear only in the House bill',
  },
] as const;

export default function QuestionEntry() {
  return (
    <section className="section questions" aria-labelledby="q-h">
      <h2 id="q-h" className="section-h">Start with a question</h2>
      <p className="section-lede">Four ways into the same live budget data — no jargon required.</p>
      <div className="question-grid">
        {QUESTIONS.map((q) => {
          const Icon = q.icon;
          return (
            <Link key={q.to} to={q.to} className="click-box question-btn">
              <span className="question-btn-icon" aria-hidden="true">
                <Icon size={20} strokeWidth={1.75} />
              </span>
              <span className="click-box-copy">
                <span className="click-box-title question-label">{q.label}</span>
                <span className="click-box-sub question-hint">{q.hint}</span>
              </span>
              <ChevronRight className="click-box-chevron" size={18} strokeWidth={2.25} aria-hidden="true" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
