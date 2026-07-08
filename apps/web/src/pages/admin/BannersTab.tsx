import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetBanners, useCreateBanner, useActivarBanner, useDeleteBanner,
  getGetBannersQueryKey, getGetBannerActivoQueryKey, type Banner,
} from "@workspace/api-client";
import { Plus, Megaphone, Trash2, ImageUp, CheckCircle2, Power, Eye, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import type { ConfirmOpts } from "@/components/ConfirmDialog";
import { inputCls, cardCls, stickyFormCls, SectionHeader } from "./shared";

interface Props {
  setConfirmar: (opts: ConfirmOpts) => void;
}

// Comprime y redimensiona la imagen en el navegador antes de subirla: la reduce a
// un lado máximo y la re-codifica como JPEG, para que el data URL base64 pese poco
// (la imagen viaja embebida en el cuerpo de la petición y se guarda en la BD).
async function comprimirImagen(file: File, maxLado = 1600, calidad = 0.72): Promise<string> {
  const leerDataUrl = new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.readAsDataURL(file);
  });
  const src = await leerDataUrl;
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Archivo de imagen inválido"));
    image.src = src;
  });
  let { width, height } = img;
  if (Math.max(width, height) > maxLado) {
    const escala = maxLado / Math.max(width, height);
    width = Math.round(width * escala);
    height = Math.round(height * escala);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo procesar la imagen");
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", calidad);
}

/** Tab "Anuncios": subir imágenes que el pasajero verá a pantalla completa al entrar. */
export default function BannersTab({ setConfirmar }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const createBanner = useCreateBanner();
  const activarBanner = useActivarBanner();
  const deleteBanner = useDeleteBanner();

  const { data: banners = [], isLoading } = useGetBanners({
    query: { queryKey: getGetBannersQueryKey() },
  });

  const [titulo, setTitulo] = useState("");
  const [imagen, setImagen] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);
  // Vista previa: muestra el overlay tal como lo verá el pasajero, sin publicarlo.
  const [preview, setPreview] = useState<{ src: string; titulo: string | null } | null>(null);

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: getGetBannersQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetBannerActivoQueryKey() });
  };

  const elegirArchivo = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Selecciona un archivo de imagen", variant: "destructive" });
      return;
    }
    setProcesando(true);
    try {
      setImagen(await comprimirImagen(file));
    } catch {
      toast({ title: "No se pudo procesar la imagen", variant: "destructive" });
    } finally {
      setProcesando(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const subir = async () => {
    if (!imagen) { toast({ title: "Primero elige una imagen", variant: "destructive" }); return; }
    try {
      await createBanner.mutateAsync({ data: { imagen_url: imagen, titulo: titulo.trim() || null, activo: true } });
      invalidar();
      setImagen(null);
      setTitulo("");
      toast({ title: "Anuncio publicado y activado" });
    } catch {
      toast({ title: "Error al publicar el anuncio", variant: "destructive" });
    }
  };

  const activar = async (id: number) => {
    try {
      await activarBanner.mutateAsync({ id });
      invalidar();
      toast({ title: "Anuncio activado" });
    } catch {
      toast({ title: "Error al activar el anuncio", variant: "destructive" });
    }
  };

  const eliminar = (banner: Banner) => {
    setConfirmar({
      titulo: "Eliminar anuncio",
      descripcion: "¿Eliminar este anuncio? Esta acción no se puede deshacer.",
      textoConfirmar: "Eliminar",
      destructivo: true,
      accion: async () => {
        try {
          await deleteBanner.mutateAsync({ id: banner.id });
          invalidar();
          toast({ title: "Anuncio eliminado" });
        } catch {
          toast({ title: "Error al eliminar el anuncio", variant: "destructive" });
        }
      },
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* ── Formulario: subir un anuncio nuevo ── */}
      <div className={`${cardCls} ${stickyFormCls}`}>
        <SectionHeader icon={<Plus className="w-4 h-4 text-primary" />} title="Nuevo anuncio" />
        <div className="space-y-3">
          <div>
            <Label className="text-xs mb-1.5">Imagen del anuncio</Label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => void elegirArchivo(e.target.files?.[0])}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={procesando}
              className="w-full aspect-video rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary/60 hover:text-primary transition-colors overflow-hidden bg-muted/20"
            >
              {imagen ? (
                <img src={imagen} alt="Vista previa del anuncio" className="w-full h-full object-contain" />
              ) : (
                <>
                  <ImageUp className="w-8 h-8" />
                  <span className="text-xs font-medium">{procesando ? "Procesando..." : "Toca para elegir una imagen"}</span>
                </>
              )}
            </button>
            {imagen && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="text-xs text-primary mt-1.5 hover:underline"
              >
                Cambiar imagen
              </button>
            )}
          </div>
          <div>
            <Label className="text-xs mb-1.5">Título (opcional, referencia interna)</Label>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej: Promoción de octubre" maxLength={120} className={inputCls} />
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => imagen && setPreview({ src: imagen, titulo: titulo.trim() || null })}
              disabled={!imagen}
              className="h-11 rounded-xl px-3"
              title="Ver cómo se verá para el pasajero"
            >
              <Eye className="w-4 h-4" />
            </Button>
            <Button onClick={subir} disabled={createBanner.isPending || procesando || !imagen} className="flex-1 h-11 rounded-xl">
              <Plus className="w-4 h-4 mr-2" />{createBanner.isPending ? "Publicando..." : "Subir y activar"}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground leading-snug">
            El anuncio activo aparece a pantalla completa a cada pasajero que entra a la app, con una X para cerrarlo; si no la toca, se cierra solo a los 15 segundos. Solo un anuncio puede estar activo a la vez.
          </p>
        </div>
      </div>

      {/* ── Lista de anuncios ── */}
      <div className={cardCls}>
        <SectionHeader icon={<Megaphone className="w-4 h-4 text-purple-400" />} title="Anuncios" count={`${banners.length} en total`} />
        {isLoading ? (
          <div className="space-y-2">{[1, 2].map((i) => <div key={i} className="h-24 bg-muted/40 rounded-xl animate-pulse" />)}</div>
        ) : banners.length === 0 ? (
          <div className="text-center py-10">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full flex items-center justify-center bg-muted/40">
              <Megaphone className="w-6 h-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">Aún no hay anuncios</p>
            <p className="text-xs text-muted-foreground mt-0.5">Sube el primero con el formulario de la izquierda.</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-96 lg:max-h-[calc(100vh-14rem)] overflow-y-auto">
            {banners.map((banner) => (
              <div key={banner.id} className="p-3 bg-secondary/30 border border-border rounded-xl" style={{ opacity: banner.activo ? 1 : 0.7 }}>
                <div className="flex items-center gap-3">
                  <img src={banner.imagen_url} alt={banner.titulo ?? "Anuncio"} className="w-20 h-14 rounded-lg object-cover flex-shrink-0 bg-muted" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate flex items-center gap-1.5">
                      {banner.titulo || "Sin título"}
                      {banner.activo && (
                        <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-600 uppercase">
                          <CheckCircle2 className="w-2.5 h-2.5" /> Activo
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">{banner.activo ? "Visible para los pasajeros" : "Oculto"}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setPreview({ src: banner.imagen_url, titulo: banner.titulo ?? null })} className="h-9 w-9 p-0 text-muted-foreground hover:text-primary" title="Ver cómo se verá para el pasajero">
                    <Eye className="w-4 h-4" />
                  </Button>
                  {!banner.activo && (
                    <Button variant="ghost" size="sm" onClick={() => activar(banner.id)} disabled={activarBanner.isPending} className="h-9 w-9 p-0 text-muted-foreground hover:text-green-600" title="Activar (mostrarlo a los pasajeros)">
                      <Power className="w-4 h-4" />
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => eliminar(banner)} className="h-9 w-9 p-0 text-muted-foreground hover:text-destructive" title="Eliminar anuncio">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Vista previa: mismo overlay a pantalla completa que ve el pasajero. */}
      {preview && (
        <div
          onClick={() => setPreview(null)}
          className="fixed inset-0 z-[1200] flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.9)" }}
        >
          <img
            src={preview.src}
            alt={preview.titulo ?? "Anuncio"}
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
          />
          <span className="absolute top-4 left-4 text-xs font-bold text-white/80 bg-black/60 rounded-full px-3 py-1.5">
            Vista previa — así lo verá el pasajero
          </span>
          <button
            onClick={() => setPreview(null)}
            aria-label="Cerrar vista previa"
            className="absolute top-4 right-4 w-11 h-11 rounded-full flex items-center justify-center text-white bg-black/60 hover:bg-black/80 border border-white/30 shadow-lg"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      )}
    </div>
  );
}
