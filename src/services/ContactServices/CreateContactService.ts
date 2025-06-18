import AppError from "../../errors/AppError";
import Contact from "../../models/Contact";
import ContactCustomField from "../../models/ContactCustomField";

interface ExtraInfo extends ContactCustomField {
  name: string;
  value: string;
}

interface Request {
  name: string;
  number: string;
  email?: string;
  profilePicUrl?: string;
  companyId: number;
  extraInfo?: ExtraInfo[];
  cpfCnpj?: string;       // CPF/CNPJ do cliente
  endereco?: string;      // Endereço completo
  cep?: string;           // CEP (formato livre)
  bairro?: string;        // Bairro
  cidade?: string;

}

const CreateContactService = async ({
  name,
  number,
  email = "",
  companyId,
  extraInfo = [],
  cpfCnpj,
  endereco,
  cep,
  bairro,
  cidade
}: Request): Promise<Contact> => {
  const numberExists = await Contact.findOne({
    where: { number, companyId }
  });

  if (numberExists) {
    throw new AppError("ERR_DUPLICATED_CONTACT");
  }

  const contact = await Contact.create(
    {
      name,
      number,
      email,
      companyId,
      extraInfo,
      cpfCnpj,     // Novo campo adicionado
      endereco,    // Novo campo adicionado
      cep,         // Novo campo adicionado
      bairro,      // Novo campo adicionado
      cidade       // Novo campo adicionado
    },
    {
      include: ["extraInfo"] // Mantido para criar relacionamentos
    }
  );

  return contact;
};

export default CreateContactService;
