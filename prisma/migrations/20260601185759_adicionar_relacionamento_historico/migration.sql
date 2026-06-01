-- AddForeignKey
ALTER TABLE "historico_modificacoes_ponto" ADD CONSTRAINT "historico_modificacoes_ponto_batida_ponto_id_fkey" FOREIGN KEY ("batida_ponto_id") REFERENCES "batidas_ponto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
