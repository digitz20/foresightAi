import { BrainCircuit } from 'lucide-react';

export default function Header() {
  return (
    <header className="py-6 px-4 md:px-8 border-b border-border/50">
      <div className="container mx-auto flex items-center gap-3">
        <BrainCircuit className="h-8 w-8 text-primary" />
        <h1 className="text-3xl font-headline font-bold text-foreground">
          ForeSight AI
        </h1>
      </div>
    </header>
  );
}
