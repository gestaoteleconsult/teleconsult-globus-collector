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
  CODIGOVEIC: number
  DATA_HORA: string
  LT: number
  HODINICIALVELOC: number
  HODFINALVELOC: number
  KMPERCORRIDOVELOC: number
  KMACUMULADOVELOC: number
  KMLITROVEIC: number
}

interface IAbastecimentoInsert {
  company_id: number
  globus_ip: string
  prefixoveic: string | number
  codigoveic: number
  data_hora: string
  lt: number
  hodinicialveloc: number
  hodfinalveloc: number
  kmpercorridoveloc: number
  kmacumuladoveloc: number
  kmlitroveic: number
}

interface IAbastecimentoInsert2 {
  company_id: number
  globus_ip: string
  prefixoveic: string | number
  dt: string
  qtdeitemabastcarro: number
  km_abastecimento: number
  dt_cad: string
}

interface IAbastecimentoRow2 {
  PREFIXOVEIC: string
  DT: string
  QTDEITEMABASTCARRO: number
  KM_ABASTECIMENTO: number
  DT_CAD: string
  KMINICIALVEIC: number
}

const api = axios.create({
  baseURL: process.env.API_BASE_URL as string,
  headers: {
    Authorization: `Bearer ${process.env.TOKEN}`
  }
})

const executar = async () => {
  try {
    const db = DbOracle.getConnection()

    // const config = await api.get<IGlobusAbastecimentoConfig[]>("/inbound/globus/config", {
    //   params: {
    //     id_empresa: process.env.ID_EMPRESA,
    //     globus_ip: process.env.ORCL_HOST
    //   }
    // })

    // console.log(config.data)

    // for await (const item of config.data) {
    // const data = await db.raw(`
    //   select
    //     prefixoveic,
    //     to_char(DATAABASTCARRO,'yyyy-mm-dd') dt,
    //     QTDEITEMABASTCARRO,
    //     to_char(DATAHORAGRAVACAO,'yyyy-mm-dd hh24:mi:ss') dt_cad,
    //     kminicialveic
    //   from
    //     ABA_ITEMABASTCARRO 
    //   left join frt_cadveiculos
    //     on frt_cadveiculos.codigoveic = ABA_ITEMABASTCARRO.CODIGOVEIC
    //   where
    //     ABA_ITEMABASTCARRO.DATAABASTCARRO between to_date(:d1,'yyyy-mm-dd') and to_date(:d2,'yyyy-mm-dd')
    //     and CODIGOTANQUE = :codigotanque
    //   order by
    //     dt_cad,
    //     CODIGOTPFROTA,
    //     prefixoveic,
    //     dt
    // `, {
    //   d1: format(subDays(new Date(), 90), "yyyy-MM-dd"),
    //   d2: format(new Date(), "yyyy-MM-dd"),
    //   codigotanque: item.globus_codigotanque
    // })

    // console.log(data.length > 0 ? data[0] : [])

    // const insertList: IAbastecimentoInsert[] = data.map((row: IAbastecimentoRow): IAbastecimentoInsert => {
    //   let prefixo: string | number = row.PREFIXOVEIC
    //   // Verificar se prefixo tem letras
    //   if (/[a-zA-Z]/.test(prefixo)) {
    //     prefixo = prefixo
    //   } else {
    //     prefixo = Number.parseInt(prefixo, 10)
    //   }

    //   return {
    //     company_id: item.company_id,
    //     globus_ip: item.globus_ip,
    //     prefixoveic: prefixo,
    //     dt: row.DT,
    //     qtdeitemabastcarro: row.QTDEITEMABASTCARRO,
    //     km_abastecimento: row.KMINICIALVEIC,
    //     dt_cad: row.DT_CAD
    //   }
    // })

    // if (insertList.length > 0) {
    //   await api.post("/inbound/globus/abastecimento", {
    //     id_empresa: process.env.ID_EMPRESA,
    //     token: process.env.TOKEN,
    //     data: insertList
    //   })
    // }

    const data = await db.raw(`
      select
        prefixoveic,
        BGM_VELOCIMETRO.CODIGOVEIC,
        TO_CHAR(DATAVELOC, 'YYYY-MM-DD') || ' ' || TO_CHAR(HORAVELOC, 'HH24:MI:SS') AS data_hora,
        KMLITROVEIC * KMPERCORRIDOVELOC lt,
        BGM_VELOCIMETRO.hodinicialveloc,
        BGM_VELOCIMETRO.hodfinalveloc, 
        BGM_VELOCIMETRO.kmpercorridoveloc, 
        BGM_VELOCIMETRO.kmacumuladoveloc, 
        KMLITROVEIC
      from 
        BGM_VELOCIMETRO 
      left join frt_cadveiculos
        on frt_cadveiculos.codigoveic=BGM_VELOCIMETRO.CODIGOVEIC
      where 
        BGM_VELOCIMETRO.DATAVELOC between to_date(:d1,'yyyy-mm-dd') and to_date(:d2,'yyyy-mm-dd')
      order by
        prefixoveic,
        data_hora  
      `, {
      d1: format(subDays(new Date(), 90), "yyyy-MM-dd"),
      d2: format(new Date(), "yyyy-MM-dd")
    })

    console.log(data.length > 0 ? data[0] : [])

    const insertList: IAbastecimentoInsert[] = data.map((row: IAbastecimentoRow): IAbastecimentoInsert => {
      let prefixo: string | number = row.PREFIXOVEIC
      // Verificar se prefixo tem letras
      if (/[a-zA-Z]/.test(prefixo)) {
        prefixo = prefixo
      } else {
        prefixo = Number.parseInt(prefixo, 10)
      }

      return {
        company_id: Number.parseInt(process.env.ID_EMPRESA as string, 10),
        globus_ip: process.env.ORCL_HOST as string,
        prefixoveic: prefixo,
        codigoveic: row.CODIGOVEIC,
        data_hora: row.DATA_HORA,
        lt: row.LT,
        hodinicialveloc: row.HODINICIALVELOC,
        hodfinalveloc: row.HODFINALVELOC,
        kmpercorridoveloc: row.KMPERCORRIDOVELOC,
        kmacumuladoveloc: row.KMACUMULADOVELOC,
        kmlitroveic: row.KMLITROVEIC
      }
    })

    if (insertList.length > 0) {
      await api.post("/inbound/globus/abastecimento/velocimetro", {
        id_empresa: process.env.ID_EMPRESA,
        token: process.env.TOKEN,
        data: insertList
      })
    }
    // }
  } catch (error) {
    console.error("Erro ao executar a requisição:", error)
  }
}

const executarAbastecimento = async () => {
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

      console.log(data.length > 0 ? data[0] : [])

      const insertList: IAbastecimentoInsert2[] = data.map((row: IAbastecimentoRow2): IAbastecimentoInsert2 => {
        let prefixo: string | number = row.PREFIXOVEIC
        // Verificar se prefixo tem letras
        if (/[a-zA-Z]/.test(prefixo)) {
          prefixo = prefixo
        } else {
          prefixo = Number.parseInt(prefixo, 10)
        }

        return {
          company_id: item.company_id,
          globus_ip: item.globus_ip,
          prefixoveic: prefixo,
          dt: row.DT,
          qtdeitemabastcarro: row.QTDEITEMABASTCARRO,
          km_abastecimento: row.KMINICIALVEIC,
          dt_cad: row.DT_CAD
        }
      })

      if (insertList.length > 0) {
        await api.post("/inbound/globus/abastecimento", {
          id_empresa: process.env.ID_EMPRESA,
          token: process.env.TOKEN,
          data: insertList
        })
      }
    }
  } catch (error) {
    console.error("Erro ao executar o abastecimento:", error)
  }
}


executar()
executarAbastecimento()

const job = new CronJob(
  '0 0 3 * * *', // cronTime
  function () {
    executar()
    executarAbastecimento()
  }, // onTick
  null, // onComplete
  true, // start
  'America/Sao_Paulo' // timeZone
);