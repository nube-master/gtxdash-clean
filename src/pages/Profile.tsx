import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { User, Lock, Save, Loader2, Eye, EyeOff, Camera } from "lucide-react";

export default function Profile() {
  const { user, avatarUrl: authAvatarUrl, refetchMeta } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [bio, setBio] = useState("");
  const [email, setEmail] = useState("");
  const [createdAt, setCreatedAt] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  // Password
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (!user) return;
    setEmail(user.email || "");
    setCreatedAt(user.created_at || "");

    const loadProfile = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) {
        setDisplayName((data as any).display_name || "");
        setPhone((data as any).phone || "");
        setBio((data as any).bio || "");
        setAvatarUrl((data as any).avatar_url || null);
      }
      setLoading(false);
    };
    loadProfile();
  }, [user]);

  const initials = displayName
    ? displayName.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)
    : email?.slice(0, 2).toUpperCase() || "U";

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "Arquivo muito grande", description: "Máximo 2MB.", variant: "destructive" });
      return;
    }

    setUploadingAvatar(true);
    const ext = file.name.split(".").pop();
    const filePath = `avatars/${user.id}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      toast({ title: "Erro no upload", description: uploadError.message, variant: "destructive" });
      setUploadingAvatar(false);
      return;
    }

    const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(filePath);
    const publicUrl = urlData.publicUrl + `?t=${Date.now()}`;

    const { error: updateError } = await supabase
      .from("profiles")
      .upsert({
        user_id: user.id,
        avatar_url: publicUrl,
        updated_at: new Date().toISOString(),
      } as any, { onConflict: "user_id" });

    if (updateError) {
      toast({ title: "Erro ao salvar avatar", description: updateError.message, variant: "destructive" });
    } else {
      setAvatarUrl(publicUrl);
      toast({ title: "Foto atualizada!" });
      await refetchMeta();
    }
    setUploadingAvatar(false);
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .upsert({
        user_id: user.id,
        display_name: displayName,
        email,
        phone,
        bio,
        updated_at: new Date().toISOString(),
      } as any, { onConflict: "user_id" });

    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Perfil salvo!", description: "Suas informações foram atualizadas." });
      await refetchMeta();
    }
    setSaving(false);
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 6) {
      toast({ title: "Senha muito curta", description: "Mínimo 6 caracteres.", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Senhas não coincidem", variant: "destructive" });
      return;
    }
    setChangingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      toast({ title: "Erro ao alterar senha", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Senha alterada!", description: "Sua senha foi atualizada com sucesso." });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }
    setChangingPassword(false);
  };

  const memberSince = createdAt
    ? new Date(createdAt).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
    : "";

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="full-width-page w-full max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold tracking-tight text-foreground">Meu Perfil</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left column - Avatar card */}
        <div className="space-y-4">
          <Card className="warroom-card">
            <CardContent className="pt-6 flex flex-col items-center text-center space-y-3">
              {/* Avatar with upload */}
              <div className="relative group">
                {avatarUrl || authAvatarUrl ? (
                  <img
                    src={avatarUrl || authAvatarUrl || ""}
                    alt="Avatar"
                    className="h-20 w-20 rounded-full object-cover border-2 border-primary/30"
                  />
                ) : (
                  <div className="h-20 w-20 rounded-full bg-primary/15 flex items-center justify-center text-2xl font-bold text-primary border-2 border-primary/30">
                    {initials}
                  </div>
                )}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingAvatar}
                  className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                >
                  {uploadingAvatar ? (
                    <Loader2 className="h-5 w-5 text-white animate-spin" />
                  ) : (
                    <Camera className="h-5 w-5 text-white" />
                  )}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                  className="hidden"
                />
              </div>
              <div>
                <p className="text-base font-semibold text-foreground">{displayName || "Usuário"}</p>
                <Badge variant="outline" className="text-[10px] mt-1 font-mono">Premium</Badge>
              </div>
              <p className="text-xs text-muted-foreground">{email}</p>
              {memberSince && (
                <p className="text-[11px] text-muted-foreground/60">Membro desde {memberSince}</p>
              )}
            </CardContent>
          </Card>

          <Card className="warroom-card">
            <CardContent className="pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Atividade</h3>
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  { label: "Posts", value: "0" },
                  { label: "Comentários", value: "0" },
                  { label: "Reações", value: "0" },
                ].map((stat) => (
                  <div key={stat.label}>
                    <p className="text-lg font-bold text-foreground">{stat.value}</p>
                    <p className="text-[10px] text-muted-foreground">{stat.label}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right column - Forms */}
        <div className="md:col-span-2 space-y-6">
          {/* Personal info */}
          <Card className="warroom-card">
            <CardHeader>
              <CardTitle className="text-sm uppercase tracking-wider flex items-center gap-2">
                <User className="h-4 w-4" />
                Informações Pessoais
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Email</label>
                <Input value={email} disabled className="text-sm bg-muted/30" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Nome</label>
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Seu nome completo"
                  className="text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Telefone</label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(11) 99999-9999"
                  className="text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Biografia</label>
                <div className="relative">
                  <Textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value.slice(0, 200))}
                    placeholder="Conte um pouco sobre você..."
                    className="text-sm min-h-[80px] resize-none"
                    maxLength={200}
                  />
                  <span className="absolute bottom-2 right-3 text-[10px] text-muted-foreground/50">
                    {bio.length}/200
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Password */}
          <Card className="warroom-card">
            <CardHeader>
              <CardTitle className="text-sm uppercase tracking-wider flex items-center gap-2">
                <Lock className="h-4 w-4" />
                Alterar Senha
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Senha atual</label>
                <div className="relative">
                  <Input
                    type={showCurrent ? "text" : "password"}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Digite sua senha atual"
                    className="text-sm pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrent(!showCurrent)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Nova senha</label>
                <div className="relative">
                  <Input
                    type={showNew ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="text-sm pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew(!showNew)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Confirmar nova senha</label>
                <div className="relative">
                  <Input
                    type={showConfirm ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repita a nova senha"
                    className="text-sm pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <Button
                onClick={handleChangePassword}
                disabled={changingPassword || !newPassword || !confirmPassword}
                variant="destructive"
                className="w-auto"
              >
                {changingPassword && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Alterar Senha
              </Button>
            </CardContent>
          </Card>

          {/* Save */}
          <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Salvar Alterações
          </Button>
        </div>
      </div>
    </div>
  );
}
