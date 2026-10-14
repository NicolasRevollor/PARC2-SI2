import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { RecomendacionOut } from '../models';
import { environment } from '../../../environments/environment';

const API_URL = environment.apiUrl;

/**
 * Recomendaciones generadas por IA (CU22) — `GET /api/recommendations` ya
 * viene acotado al Cliente autenticado del lado del backend. Es una
 * seccion secundaria del catalogo: si falla, se muestra vacia en silencio
 * (sin toast), nunca bloquea ni molesta al Cliente.
 */
@Injectable({
  providedIn: 'root'
})
export class RecommendationsService {
  constructor(private http: HttpClient) {}

  getMisRecomendaciones(): Promise<RecomendacionOut[]> {
    return firstValueFrom(
      this.http.get<RecomendacionOut[]>(`${API_URL}/api/recommendations`)
    ).catch(() => []);
  }
}
