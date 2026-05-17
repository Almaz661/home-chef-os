import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ChefHat, Delete } from "lucide-react";

export default function SetupPage() {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [step, setStep] = useState<"name" | "pin">("name");
  const utils = trpc.useUtils();

  const setup = trpc.auth.setup.useMutation({
    onSuccess: () => {
      utils.auth.listUsers.invalidate();
      toast.success("Добро пожаловать в ШефДом!");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleDigit = (d: string) => {
    if (pin.length < 4) setPin(p => p + d);
  };
  const handleDelete = () => setPin(p => p.slice(0, -1));

  const handleSubmitName = () => {
    if (name.trim().length < 1) return toast.error("Введите имя");
    setStep("pin");
  };

  const handleSubmitPin = () => {
    if (pin.length !== 4) return;
    setup.mutate({ name: name.trim(), pin });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-4 shadow-lg">
            <ChefHat className="w-10 h-10 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">ШефДом</h1>
          <p className="text-muted-foreground mt-1">Первоначальная настройка</p>
        </div>

        {step === "name" ? (
          <div className="bg-card rounded-2xl p-6 shadow-sm border border-border">
            <h2 className="text-lg font-semibold text-foreground mb-4 text-center">Как вас зовут?</h2>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSubmitName()}
              placeholder="Например: Семья Ивановых"
              className="w-full px-4 py-3 rounded-xl border border-input bg-background text-foreground text-center text-lg focus:outline-none focus:ring-2 focus:ring-ring"
              autoFocus
            />
            <button
              onClick={handleSubmitName}
              className="w-full mt-4 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-lg hover:opacity-90 transition-opacity"
            >
              Далее
            </button>
          </div>
        ) : (
          <div className="bg-card rounded-2xl p-6 shadow-sm border border-border">
            <h2 className="text-lg font-semibold text-foreground mb-2 text-center">Создайте PIN-код</h2>
            <p className="text-sm text-muted-foreground text-center mb-6">Придумайте 4-значный PIN для входа</p>

            {/* PIN dots */}
            <div className="flex justify-center gap-4 mb-8">
              {[0, 1, 2, 3].map(i => (
                <div key={i} className={`w-5 h-5 rounded-full transition-all ${
                  i < pin.length ? "bg-primary scale-110" : "bg-border"
                }`} />
              ))}
            </div>

            {/* Numpad */}
            <div className="grid grid-cols-3 gap-3">
              {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((d, i) => {
                if (d === "") return <div key={i} />;
                if (d === "⌫") return (
                  <button key={i} onClick={handleDelete}
                    className="h-14 rounded-xl bg-secondary text-foreground font-semibold text-xl flex items-center justify-center hover:bg-accent transition-colors">
                    <Delete className="w-5 h-5" />
                  </button>
                );
                return (
                  <button key={i} onClick={() => handleDigit(d)}
                    className="h-14 rounded-xl bg-secondary text-foreground font-bold text-2xl hover:bg-accent transition-colors">
                    {d}
                  </button>
                );
              })}
            </div>

            <button
              onClick={handleSubmitPin}
              disabled={pin.length !== 4 || setup.isPending}
              className="w-full mt-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-lg disabled:opacity-40 hover:opacity-90 transition-opacity"
            >
              {setup.isPending ? "Создание..." : "Создать аккаунт"}
            </button>

            <button onClick={() => { setStep("name"); setPin(""); }}
              className="w-full mt-2 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              ← Назад
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
