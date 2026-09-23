import "dotenv/config"
import axios from "axios"
import { format, subDays } from "date-fns"
import { CronJob } from 'cron';

import DbOracle from "./database/connectionManager.js"

export type IGlobusAbastecimentoConfig = {
  id: number
  company_id: number
  globus_ip: string
  globus_codigotanque: number
  created_at: Date
  updated_at: Date
}

interface IAbastecimentoRow {
  PREFIXOVEIC: string
  DT: string
  QTDEITEMABASTCARRO: number
  KMINICIALVEIC: number
  DT_CAD: string
}

interface IAbastecimentoInsert {
  company_id: number
  globus_ip: string
  prefixoveic: string
  dt: string
  qtdeitemabastcarro: number
  km_abastecimento: number
  dt_cad: string
}

const api = axios.create({
  baseURL: process.env.API_BASE_URL as string,
  headers: {
    Authorization: `Bearer ${process.env.API_TOKEN}`
  }
})

const executar = async () => {
  try {
    const db = DbOracle.getConnection()

    const config = await api.get<IGlobusAbastecimentoConfig[]>("/inbound/globus/config", {
      params: {
        id_empresa: process.env.ID_EMPRESA,
        globus_ip: process.env.ORCL_HOST
      }
    })

    console.log(config.data)

    for await (const item of config.data) {
      const data = await db.raw(`
        select
          prefixoveic,
          to_char(DATAABASTCARRO,'yyyy-mm-dd') dt,
          QTDEITEMABASTCARRO,
          to_char(DATAHORAGRAVACAO,'yyyy-mm-dd hh24:mi:ss') dt_cad,
          kminicialveic
        from
          ABA_ITEMABASTCARRO 
        left join frt_cadveiculos
          on frt_cadveiculos.codigoveic = ABA_ITEMABASTCARRO.CODIGOVEIC
        where
          ABA_ITEMABASTCARRO.DATAABASTCARRO between to_date(:d1,'yyyy-mm-dd') and to_date(:d2,'yyyy-mm-dd')
          and CODIGOTANQUE = :codigotanque
        order by
          dt_cad,
          CODIGOTPFROTA,
          prefixoveic,
          dt
      `, {
        d1: format(subDays(new Date(), 90), "yyyy-MM-dd"),
        d2: format(new Date(), "yyyy-MM-dd"),
        codigotanque: item.globus_codigotanque
      })

      console.log(data)

      const insertList: IAbastecimentoInsert[] = data.map((row: IAbastecimentoRow): IAbastecimentoInsert => {
        return {
          company_id: item.company_id,
          globus_ip: item.globus_ip,
          prefixoveic: row.PREFIXOVEIC,
          dt: row.DT,
          qtdeitemabastcarro: row.QTDEITEMABASTCARRO,
          km_abastecimento: row.KMINICIALVEIC,
          dt_cad: row.DT_CAD
        }
      })

      if (insertList.length > 0) {
        await api.post("/inbound/globus/abastecimento", insertList)
      }
    }
  } catch (error) {
    console.error("Erro ao executar a requisição:", error)
  }
}

executar()

const job = new CronJob(
  '0 0 3 * * *', // cronTime
  function () {
    executar()
  }, // onTick
  null, // onComplete
  true, // start
  'America/Sao_Paulo' // timeZone
);