import { ChangeEvent, Component } from 'react';
import { connect } from 'react-redux';
import { Dispatch } from 'redux';
import { Checkbox, Form, Input } from 'semantic-ui-react';
import * as validator from 'validator';
import { withTranslation, WithTranslation } from 'react-i18next';
import { Company, CompanyParams, CompanyStatus, Roles } from '../../../clients/server.generated';
import { createSingle, deleteSingle, saveSingle } from '../../../stores/single/actionCreators';
import ResourceStatus from '../../../stores/resourceStatus';
import { RootState } from '../../../stores/store';
import PropsButtons from '../../PropsButtons';
import { getSingle } from '../../../stores/single/selectors';
import { SingleEntities } from '../../../stores/single/single';
import AuthorizationComponent from '../../AuthorizationComponent';
import TextArea from '../../TextArea';
import { authedUserHasRole } from '../../../stores/auth/selectors';
import { withRouter, WithRouter } from '../../../WithRouter';
import CountrySelector from './CountrySelector';

const emailHasError = (value: string) => {
  const email = value.trim();
  return !validator.isEmpty(email) && !validator.isEmail(email);
};

const vatNumberHasError = (value: string) => {
  const vatNumber = value.replace(/\s/g, '').toUpperCase();
  return !validator.isEmpty(vatNumber) && !validator.isVAT(vatNumber, 'NL');
};

interface Props extends WithTranslation, WithRouter {
  create?: boolean;
  onCancel?: () => void;

  company: Company;
  status: ResourceStatus;

  hasRole: (role: Roles) => boolean;
  canEdit: Roles[];
  canDelete: Roles[];

  saveCompany: (id: number, company: CompanyParams) => void;
  createCompany: (company: CompanyParams) => void;
  deleteCompany: (id: number) => void;
}

interface State {
  editing: boolean;
  name: string;
  comments: string | undefined;
  email: string;
  vatNumber: string;
  phoneNumber: string | undefined;
  status: CompanyStatus;
  addressStreet: string;
  addressPostalCode: string;
  addressCity: string;
  addressCountry: string;
  invoiceAddressStreet: string;
  invoiceAddressPostalCode: string;
  invoiceAddressCity: string;
  invoiceAddressCountry: string;
}

class CompanyProps extends Component<Props, State> {
  static defaultProps = {
    create: undefined,
    onCancel: undefined,
  };

  public constructor(props: Props) {
    super(props);

    this.state = {
      editing: props.create ?? false,
      ...this.extractState(props),
    };
  }

  componentDidUpdate(prevProps: Props) {
    if (prevProps.status === ResourceStatus.SAVING && this.props.status === ResourceStatus.FETCHED) {
      this.setState({ editing: false });
    }
  }

  extractState = (props: Props) => {
    const { company } = props;
    return {
      name: company.name,
      comments: company.comments,
      email: company.email,
      vatNumber: company.vatNumber,
      phoneNumber: company.phoneNumber,
      status: company.status,
      addressStreet: company.addressStreet,
      addressPostalCode: company.addressPostalCode,
      addressCity: company.addressCity,
      addressCountry: company.addressCountry,
      invoiceAddressStreet: company.invoiceAddressStreet,
      invoiceAddressPostalCode: company.invoiceAddressPostalCode,
      invoiceAddressCity: company.invoiceAddressCity,
      invoiceAddressCountry: company.invoiceAddressCountry,
      updatedAt: company.updatedAt,
    };
  };

  toParams = (): CompanyParams => {
    return new CompanyParams({
      name: this.state.name,
      comments: this.state.comments,
      phoneNumber: this.state.phoneNumber,
      email: this.state.email,
      vatNumber: this.state.vatNumber,
      status: this.state.status,
      addressStreet: this.state.addressStreet,
      addressPostalCode: this.state.addressPostalCode,
      addressCity: this.state.addressCity,
      addressCountry: this.state.addressCountry,
      invoiceAddressStreet: this.state.invoiceAddressStreet,
      invoiceAddressPostalCode: this.state.invoiceAddressPostalCode,
      invoiceAddressCity: this.state.invoiceAddressCity,
      invoiceAddressCountry: this.state.invoiceAddressCountry,
    });
  };

  edit = () => {
    this.setState({ editing: true, ...this.extractState(this.props) });
  };

  cancel = () => {
    if (!this.props.create) {
      this.setState({ editing: false, ...this.extractState(this.props) });
    } else if (this.props.onCancel) {
      this.props.onCancel();
    }
  };

  save = () => {
    if (this.props.create) {
      this.props.createCompany(this.toParams());
    } else {
      this.props.saveCompany(this.props.company.id, this.toParams());
    }
  };

  remove = () => {
    if (!this.props.create && this.props.deleteCompany) {
      const { navigate } = this.props.router;
      navigate('/company');
      this.props.deleteCompany(this.props.company.id);
    }
  };

  deleteButtonActive = () => {
    if (this.props.create) {
      return undefined;
    }
    return !(
      this.props.company.contacts.length > 0 ||
      this.props.company.invoices.length > 0 ||
      this.props.company.contacts.length > 0
    );
  };

  propsHaveErrors = (): boolean => {
    const { name, phoneNumber, addressStreet, addressCity, addressPostalCode, email, vatNumber } = this.state;
    return (
      validator.isEmpty(name) ||
      (!validator.isEmpty(phoneNumber!) && !validator.isMobilePhone(phoneNumber!)) ||
      validator.isEmpty(addressStreet) ||
      validator.isEmpty(addressCity) ||
      !validator.isPostalCode(addressPostalCode, 'any') ||
      emailHasError(email) ||
      vatNumberHasError(vatNumber)
    );
  };

  render() {
    const {
      editing,
      name,
      comments,
      email,
      vatNumber,
      phoneNumber,
      status,
      addressStreet,
      addressPostalCode,
      addressCity,
      addressCountry,
      invoiceAddressStreet,
      invoiceAddressPostalCode,
      invoiceAddressCity,
      invoiceAddressCountry,
    } = this.state;
    const { t } = this.props;

    return (
      <>
        <h2>
          {this.props.create ? t('entities.company.newCompany') : t('entities.company.props.details')}
          <AuthorizationComponent roles={[Roles.ADMIN, Roles.GENERAL]} notFound={false}>
            <PropsButtons
              editing={editing}
              canEdit={this.props.canEdit.some(this.props.hasRole)}
              canDelete={this.deleteButtonActive() && this.props.canDelete.some(this.props.hasRole)}
              canSave={!this.propsHaveErrors()}
              entity={SingleEntities.Company}
              status={this.props.status}
              cancel={this.cancel}
              edit={this.edit}
              save={this.save}
              remove={this.remove}
            />
          </AuthorizationComponent>
        </h2>

        <Form style={{ marginTop: '2em' }}>
          <Form.Group widths="equal">
            <Form.Field
              required
              disabled={!editing}
              id="form-input-name"
              placeholder={t('entities.company.props.name')}
              fluid
              control={Input}
              label={t('entities.company.props.name')}
              value={name}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                this.setState({
                  name: e.target.value,
                })
              }
              error={validator.isEmpty(name)}
            />
            <Form.Field
              disabled={!editing}
              id="form-input-phone-number"
              fluid
              control={Input}
              label={t('entities.company.props.number')}
              placeholder={t('entities.company.props.number')}
              value={phoneNumber}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                this.setState({
                  phoneNumber: e.target.value,
                })
              }
              error={!validator.isEmpty(phoneNumber!) && !validator.isMobilePhone(phoneNumber!)}
            />
          </Form.Group>
          <Form.Group widths="equal">
            <Form.Field
              disabled={!editing}
              id="form-input-email"
              fluid
              control={Input}
              label={t('entities.company.props.email')}
              placeholder={t('entities.company.props.email')}
              value={email}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                this.setState({
                  email: e.target.value,
                })
              }
              error={emailHasError(email)}
            />
          </Form.Group>
          <Form.Group widths="equal">
            <Form.Field>
              <label htmlFor="form-check-status">{t('entities.product.props.status.header')}</label>
              <Checkbox
                disabled={!editing}
                toggle
                id="form-check-status"
                label={
                  status === CompanyStatus.ACTIVE
                    ? t('entities.product.props.status.active')
                    : t('entities.product.props.status.inactive')
                }
                checked={status === CompanyStatus.ACTIVE}
                onChange={(_, data) =>
                  this.setState({
                    status: data.checked ? CompanyStatus.ACTIVE : CompanyStatus.INACTIVE,
                  })
                }
              />
            </Form.Field>
            <Form.Field
              disabled={!editing}
              id="form-input-vat-number"
              fluid
              control={Input}
              label={t('entities.company.props.vatNumber')}
              placeholder={t('entities.company.props.vatNumber')}
              value={vatNumber}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                this.setState({
                  vatNumber: e.target.value,
                })
              }
              error={vatNumberHasError(vatNumber)}
            />
          </Form.Group>
          <Form.Group widths="equal">
            <Form.Field disabled={!editing}>
              <label htmlFor="form-input-description">{t('entities.company.props.description')}</label>
              <TextArea
                id="form-input-description"
                value={comments}
                onChange={(e) => this.setState({ comments: e.target.value })}
                placeholder={t('entities.company.props.description')}
              />
            </Form.Field>
          </Form.Group>
          <h2>{t('entities.company.props.addressInformation')}</h2>
          <Form.Group widths="equal">
            <Form.Field disabled={!editing} required error={validator.isEmpty(addressStreet)}>
              <label htmlFor="form-input-address-street">{t('entities.company.props.street')}</label>
              <Input
                id="form-input-address-street"
                value={addressStreet}
                fluid
                onChange={(e) => this.setState({ addressStreet: e.target.value })}
                placeholder={t('entities.company.props.street')}
              />
            </Form.Field>
            <Form.Field disabled={!editing} required error={validator.isEmpty(addressCity)}>
              <label htmlFor="form-input-address-city">{t('entities.company.props.city')}</label>
              <Input
                id="form-input-address-city"
                value={addressCity}
                fluid
                onChange={(e) => this.setState({ addressCity: e.target.value })}
                placeholder={t('entities.company.props.city')}
              />
            </Form.Field>
          </Form.Group>
          <Form.Group widths="equal">
            <Form.Field disabled={!editing} required error={!validator.isPostalCode(addressPostalCode, 'any')}>
              <label htmlFor="form-input-address-postal-code">{t('entities.company.props.postalCode')}</label>
              <Input
                id="form-input-address-postal-code"
                value={addressPostalCode}
                fluid
                onChange={(e) => this.setState({ addressPostalCode: e.target.value })}
                placeholder={t('entities.company.props.postalCode')}
              />
            </Form.Field>
            <CountrySelector
              editing={editing}
              country={addressCountry}
              updateValue={(_, data) =>
                this.setState({
                  addressCountry: data.value?.toString() ?? '',
                })
              }
              id="form-input-address-country"
            />
          </Form.Group>
          <h2>{t('entities.company.props.invoiceAddress')}</h2>
          <Form.Group widths="equal">
            <Form.Field disabled={!editing}>
              <label htmlFor="form-input--invoice-address-street">{t('entities.company.props.street')}</label>
              <Input
                id="form-input-invoice-address-street"
                value={invoiceAddressStreet}
                onChange={(e) => this.setState({ invoiceAddressStreet: e.target.value })}
                placeholder={t('entities.company.props.street')}
                fluid
              />
            </Form.Field>
            <Form.Field disabled={!editing}>
              <label htmlFor="form-input-invoice-address-city">{t('entities.company.props.city')}</label>
              <Input
                id="form-input-invoice-address-city"
                value={invoiceAddressCity}
                onChange={(e) => this.setState({ invoiceAddressCity: e.target.value })}
                placeholder={t('entities.company.props.city')}
                fluid
              />
            </Form.Field>
          </Form.Group>
          <Form.Group widths="equal">
            <Form.Field disabled={!editing}>
              <label htmlFor="form-input-invoice-address-postal-code">{t('entities.company.props.postalCode')}</label>
              <Input
                id="form-input-invoice-address-postal-code"
                value={invoiceAddressPostalCode}
                onChange={(e) => this.setState({ invoiceAddressPostalCode: e.target.value })}
                placeholder={t('entities.company.props.postalCode')}
                fluid
              />
            </Form.Field>
            <CountrySelector
              editing={editing}
              country={invoiceAddressCountry}
              updateValue={(_, data) =>
                this.setState({
                  invoiceAddressCountry: data.value?.toString() ?? '',
                })
              }
              id="form-input-invoice-address-country"
            />
          </Form.Group>
        </Form>
      </>
    );
  }
}

const mapStateToProps = (state: RootState) => {
  return {
    status: getSingle<Company>(state, SingleEntities.Company).status,
    hasRole: (role: Roles): boolean => authedUserHasRole(state, role),
  };
};

const mapDispatchToProps = (dispatch: Dispatch) => ({
  saveCompany: (id: number, company: CompanyParams) => dispatch(saveSingle(SingleEntities.Company, id, company)),
  createCompany: (company: CompanyParams) => dispatch(createSingle(SingleEntities.Company, company)),
  deleteCompany: (id: number) => dispatch(deleteSingle(SingleEntities.Company, id)),
});

export default withTranslation()(withRouter(connect(mapStateToProps, mapDispatchToProps)(CompanyProps)));
