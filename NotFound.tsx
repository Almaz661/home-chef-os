import { Button } from "@/components/ui/button";
import { ChefHat, Home } from "lucide-react";
import { useLocation } from "wouter";

export default function NotFound() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <div className="text-center px-4">
        <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
          <ChefHat className="w-10 h-10 text-primary" />
        </div>
        <h1 className="text-6xl font-bold text-primary mb-2">404</h1>
        <h2 className="text-xl font-semibold text-foreground mb-3">
          Страница не найдена
        </h2>
        <p className="text-muted-foreground mb-8 max-w-sm mx-auto">
          Похоже, этот рецепт ещё не написан. Вернитесь на главную страницу.
        </p>
        <Button
          onClick={() => setLocation("/")}
          className="bg-primary text-primary-foreground hover:opacity-90 px-6 py-2.5 rounded-xl"
        >
          <Home className="w-4 h-4 mr-2" />
          На главную
        </Button>
      </div>
    </div>
  );
}
